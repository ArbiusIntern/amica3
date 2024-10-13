import * as THREE from "three";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";
import { VRMLookAtSmootherLoaderPlugin } from "@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin";
import { LipSync } from "@/features/lipSync/lipSync";
import { EmoteController } from "@/features/emoteController/emoteController";
import { Screenplay } from "@/features/chat/messages";
import { Viewer } from "@/features/vrmViewer/viewer";
import { config } from "@/utils/config";
import { loadMixamoAnimation } from "@/lib/VRMAnimation/loadMixamoAnimation";

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null;
  public mixer?: THREE.AnimationMixer;
  public emoteController?: EmoteController;

  private _lookAtTargetParent: THREE.Object3D;
  private _lipSync?: LipSync;

  private _walkAction?: THREE.AnimationAction;
  private _idleAction?: THREE.AnimationAction;
  public _currentAction?: THREE.AnimationAction;

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
  }

  public async autoWalk(targetPosition: THREE.Vector3, movementSpeed: number, camera: THREE.PerspectiveCamera): Promise<void> {
    // Move towards the target position
    const modelPosition = this.vrm?.scene.position; // Current position of the model
    if (modelPosition) {
      const directionToTarget = targetPosition!.clone()
        .sub(modelPosition)
        .normalize(); // Calculate direction to target
      const distanceToTarget = modelPosition.distanceTo(targetPosition!);

      const walkTargetDirection = targetPosition!.clone()
        .sub(modelPosition)
        .normalize(); // Walk direction

      const rotateAngle = new THREE.Vector3(0, 1, 0); // Rotation axis for Y-axis
      const walkRotateQuaternion: THREE.Quaternion = new THREE.Quaternion();
      const idleRotateQuaternion: THREE.Quaternion = new THREE.Quaternion();

      // Calculate the angle towards the camera direction
      const idleAngleYCameraDirection = Math.atan2(
        camera?.position.x! - modelPosition.x,
        camera?.position.z! - modelPosition.z,
      );

      // Set quaternions for walking and idle
      walkRotateQuaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1), // Model's default forward direction
        walkTargetDirection, // Direction to target
      );
      idleRotateQuaternion.setFromAxisAngle(
        rotateAngle,
        idleAngleYCameraDirection + Math.PI,
      );

      if (distanceToTarget > 0.05 + 0.01) {
        // Walking state: Rotate towards the target position in all axes
        this.vrm?.scene.quaternion.rotateTowards(walkRotateQuaternion, 0.2);

        // Ensure the model is walking
        if (this._walkAction && this._currentAction !== this._walkAction) {
          this.fadeToAction(this._walkAction, 0.5);
          this._currentAction = this._walkAction;
        }

        // Move the model step by step towards the target
        const step = directionToTarget.multiplyScalar(movementSpeed);
        modelPosition.add(step); // Move the model
      } else if (distanceToTarget <= 0.05) {
        // Idle state only when the model is well within the target range (buffer applied)
        this.vrm?.scene.quaternion.rotateTowards(idleRotateQuaternion, 0.2);

        // Ensure the model is idle
        if (this._idleAction && this._currentAction !== this._idleAction) {
          this.fadeToAction(this._idleAction, 0.5);
          this._currentAction = this._idleAction;
        }
      }
    }
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

    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);

    // TODO this causes helperRoot to be rendered to side
    VRMUtils.rotateVRM0(vrm);

    //Loaded walking animation
    const walkAnimation = await loadMixamoAnimation(
      "/animations/walking.fbx",
      this.vrm!,
    );
    if (walkAnimation) {
      const clip =
      walkAnimation instanceof THREE.AnimationClip
        ? walkAnimation
        : (walkAnimation as any).createAnimationClip(vrm);  
      this._walkAction = this.mixer!.clipAction(clip);
      Object.assign(this._walkAction, {
        clampWhenFinished: true,
        loop: THREE.LoopRepeat,
      });
    }

    const idleAnimation = await loadMixamoAnimation(
      "/animations/idle.fbx",
      this.vrm!,
    );
    if (idleAnimation) {
      const clip =
      idleAnimation instanceof THREE.AnimationClip
        ? idleAnimation
        : (idleAnimation as any).createAnimationClip(vrm);  
      this._idleAction = this.mixer!.clipAction(clip);
      Object.assign(this._idleAction, {
        clampWhenFinished: true,
        loop: THREE.LoopRepeat,
      });
    }
  
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
  public async loadAnimation(
    animation: VRMAnimation | THREE.AnimationClip,
  ): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip =
      animation instanceof THREE.AnimationClip
        ? animation
        : animation.createAnimationClip(vrm);
    mixer.stopAllAction();
    this._currentAction = mixer.clipAction(clip);
    this._currentAction.play();
  }

  private async fadeToAction( destAction: THREE.AnimationAction, duration: number) {
    let previousAction = this._currentAction;
    this._currentAction = destAction;

    if (previousAction !== this._currentAction) {
      previousAction?.fadeOut(duration);
    }

    this._currentAction
					.reset()
					.setEffectiveTimeScale( 1 )
					.setEffectiveWeight( 1 )
					.fadeIn( 0.5 )
					.play();
  }

  private async modifyAnimationPosition(clip: THREE.AnimationClip) {
    const { vrm } = this;
    if (vrm == null) {
      throw new Error("You have to load VRM first");
    }

    // Find the hips bone
    const hipsBone = vrm.humanoid.getNormalizedBoneNode("hips");

    if (!hipsBone) {
      throw new Error("Bone not found in VRM model");
    }

    // Use the current hips bone position as the start position
    const currentHipsPosition = hipsBone!.getWorldPosition(new THREE.Vector3());

    // Extract the start position from the animation clip
    let clipStartPositionHips: THREE.Vector3 | null = null;
    
    for (const track of clip.tracks) {
      if (track.name.endsWith(".position") && track.name.includes("Hips")) {
        const values = (track as THREE.VectorKeyframeTrack).values;
        clipStartPositionHips = new THREE.Vector3(values[0], values[1], values[2]);
        break;
      }
    }

    if (clipStartPositionHips) {
      // Calculate the offset
      const offsetHips = currentHipsPosition.clone().sub(clipStartPositionHips);

      // Apply the offset to all keyframes
      for (const track of clip.tracks) {
        if (track.name.endsWith(".position") && track.name.includes("Hips")) {
          const values = (track as THREE.VectorKeyframeTrack).values;
          for (let i = 0; i < values.length; i += 3) {
            values[i] -= offsetHips.x;
            values[i + 1] -= offsetHips.y;
            values[i + 2] -= offsetHips.z;
          }
        }
      }
    } else {
      console.warn("Could not determine start position from animation clip.");
    }
  }

  public async playAnimation(animation: VRMAnimation | THREE.AnimationClip, modify: boolean): Promise<number> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip =
      animation instanceof THREE.AnimationClip
        ? animation
        : animation.createAnimationClip(vrm);

    // modify the initial position of the VRMA animation to be sync with idle animation
    if (modify) {
      this.modifyAnimationPosition(clip);
    }
    
    const idleAction = this._currentAction!;
    const VRMAaction = mixer.clipAction(clip);
    VRMAaction.clampWhenFinished = true;
    VRMAaction.loop = THREE.LoopOnce;
    this.fadeToAction(VRMAaction,1);

    const restoreState = () => {
      mixer.removeEventListener( 'finished', restoreState );
      this.fadeToAction(idleAction,1);
    }

    mixer.addEventListener("finished", restoreState);
    return clip.duration;
  }

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

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume } = this._lipSync.update();
      this.emoteController?.lipSync("aa", volume);
    }

    this.emoteController?.update(delta);
    this.mixer?.update(delta);
    this.vrm?.update(delta);
  }
}
