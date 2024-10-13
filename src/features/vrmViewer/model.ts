import * as THREE from "three";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";
import { VRMLookAtSmootherLoaderPlugin } from "@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin";
import { LipSync } from "@/features/lipSync/lipSync";
import { EmoteController } from "@/features/emoteController/emoteController";
import { Screenplay } from "@/features/chat/messages";
import { config } from "@/utils/config";
import { AnimationController } from "../animationController/animationController";

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null;
  public mixer?: THREE.AnimationMixer;

  private _lookAtTargetParent: THREE.Object3D;
  private _lipSync?: LipSync;

  public emoteController?: EmoteController;
  public animationController?: AnimationController;


  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
  }

  public async playWalk(): Promise<void> {
    this.animationController?.playWalk();
  }

  public async loadAnimation(animation: VRMAnimation | THREE.AnimationClip): Promise<void>  {
    this.animationController?.playBaseAnimation(animation);
  }

  public async playSingleAnimation(animation: VRMAnimation | THREE.AnimationClip, modify: boolean): Promise<number> {
    return this.animationController?.playSingleAnimation(animation, modify)!;
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader();

    // used for debug rendering
    const helperRoot = new THREE.Group();
    helperRoot.renderOrder = 10000;

    loader.register((parser) => {
      const options: any = {
        lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
      };

      if (config("debug_gfx") === "true") {
        options.helperRoot = helperRoot;
      }

      return new VRMLoaderPlugin(parser, options);
    });

    const gltf = await loader.loadAsync(url);

    const vrm = (this.vrm = gltf.userData.vrm);
    vrm.scene.name = "VRMRoot";

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);

    // Disable frustum culling
    vrm.scene.traverse((obj: THREE.Object3D) => {
      obj.frustumCulled = false;
    });

    if (config("debug_gfx") === "true") {
      vrm.scene.add(helperRoot);
    }

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);
    this.animationController = new AnimationController(vrm);

    // TODO this causes helperRoot to be rendered to side
    VRMUtils.rotateVRM0(vrm);
  }

  public unLoadVrm() {
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
  }

  /**
   * VRMアニメーションを読み込む
   *
   * https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.ja.md
   */
  

  public async playEmotion(expression: string) {
    this.emoteController?.playEmotion(expression);
  }

  /**
   * 音声を再生し、リップシンクを行う
   */
  public async speak(buffer: ArrayBuffer, screenplay: Screenplay) {
    this.emoteController?.playEmotion(screenplay.expression);
    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(buffer, () => {
        resolve(true);
      });
    });
  }

  public update(delta: number, xr?: THREE.WebXRManager, camera?: THREE.PerspectiveCamera ): void {
    if (this._lipSync) {
      const { volume } = this._lipSync.update();
      this.emoteController?.lipSync("aa", volume);
    }

    this.emoteController?.update(delta);
    (xr) ? this.animationController?.update(delta, xr, camera) : this.animationController?.update(delta);
    this.vrm?.update(delta);
  }
}
