import * as THREE from "three";
import {
  MToonMaterial,
  MToonMaterialLoaderPlugin,
  VRM,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
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
    this.animationController?.playWalk("auto");
  }

  public async loadAnimation(animation: VRMAnimation | THREE.AnimationClip): Promise<void>  {
    this.animationController?.playBaseAnimation(animation);
  }

  public async playSingleAnimation(animation: VRMAnimation | THREE.AnimationClip, modify: boolean): Promise<number> {
    return this.animationController?.playSingleAnimation(animation, modify)!;
  }

  public async loadVRM(url: string, setLoadingProgress: (progress: string) => void): Promise<void> {
    const loader = new GLTFLoader();

    // used for debug rendering
    const helperRoot = new THREE.Group();
    helperRoot.renderOrder = 10000;

    // the type of material to use
    // should usually be MToonMaterial
    let materialType: any;
    switch (config("mtoon_material_type")) {
      case "mtoon":
        materialType = MToonMaterial;
        break;
      case "mtoon_node":
        // @ts-ignore
        const { MToonNodeMaterial } = await import('@pixiv/three-vrm/nodes');
        materialType = MToonNodeMaterial;
        break;
      case "meshtoon":
        materialType = THREE.MeshToonMaterial;
        break;
      case "basic":
        materialType = THREE.MeshBasicMaterial;
        break;
      case "depth":
        materialType = THREE.MeshDepthMaterial;
        break;
      case "normal":
        materialType = THREE.MeshNormalMaterial;
        break;
      default:
        console.error('mtoon_material_type not found');
        break;
    }

    if (config("use_webgpu") === "true") {
      // create a WebGPU compatible MToonMaterialLoaderPlugin
      // @ts-ignore
      // TODO currently MToonNodeMaterial is broken in amica
      // materialType = MTonNodeMaterial;
    }

    loader.register((parser) => {
      const options: any = {
        lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, {
          materialType,
        }),
      };

      if (config("debug_gfx") === "true") {
        options.helperRoot = helperRoot;
      }

      return new VRMLoaderPlugin(parser, options);
    });

    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        setLoadingProgress("Processing VRM");

        const vrm = (this.vrm = gltf.userData.vrm);
        vrm.scene.name = "VRMRoot";

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        const mtoonDebugMode = config('mtoon_debug_mode');
        vrm.scene.traverse((obj: any) => {
          obj.frustumCulled = false;

          if (mtoonDebugMode !== 'none') {
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((mat: any) => {
                  if (mat.isMToonMaterial) {
                    mat.debugMode = mtoonDebugMode;
                  }
                });
              } else {
                if (obj.material.isMToonMaterial) {
                  obj.material.debugMode = mtoonDebugMode;
                }
              }
            }
          }
        });

        if (config("debug_gfx") === "true") {
          vrm.scene.add(helperRoot);
        }

        // TODO this causes helperRoot to be rendered to side
        // VRMUtils.rotateVRM0(vrm);
        // hacky fix
        if (vrm.meta?.metaVersion === '0') {
          vrm.scene.rotation.y = Math.PI;
          helperRoot.rotation.y = Math.PI;
        }


        this.mixer = new THREE.AnimationMixer(vrm.scene);
        this.animationController = new AnimationController(vrm);
        this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);

        resolve();
      }, (xhr) => {
        setLoadingProgress(`${Math.floor(xhr.loaded / xhr.total * 10000)/100}% loaded`);
      }, (error) => {
        reject(error);
      });
    });
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
    this.animationController?.playAnimation(screenplay.animations);
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
