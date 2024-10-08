import * as THREE from "three";
import {
  VRM,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";
import { fadeToAction, modifyAnimationPosition, clipAnimation } from "./animationUtils";
import { AutoWalk } from "./autoWalk";


export class MotionController {
  public vrm?: VRM | null;
  public mixer?: THREE.AnimationMixer;
  public camera?: THREE.PerspectiveCamera;

//   private _animationManager?: AnimationManager;
  private _currentAnimation?: THREE.AnimationAction | null;
  private _autoWalk?: AutoWalk;
  

  constructor(vrm: VRM, mixer: THREE.AnimationMixer) {
    this.vrm = vrm;
    this._currentAnimation = null;
    this.mixer = mixer;

    this._autoWalk = new AutoWalk(vrm ,mixer);

  }

  /**
   * VRMアニメーションを読み込む
   *
   * https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.ja.md
   */

  // Play base animation that will loop repeatly
  public async playBaseAnimation(animation: VRMAnimation | THREE.AnimationClip): Promise<void> {
    const { mixer } = this;
    if (mixer == null) {
      throw new Error("You have to load VRM first");
    }
    
    const clip = await clipAnimation(this.vrm! ,animation);
    // Stop all the animation
    mixer.stopAllAction()
    // Create animation action from animation clip
    this._currentAnimation = mixer.clipAction(clip);
    this._currentAnimation.play();
  }

  // Play single animation 
  public async playSingleAnimation(animation: VRMAnimation | THREE.AnimationClip, modify: boolean): Promise<number> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip = await clipAnimation(this.vrm!, animation);

    // Modify the initial position of the VRMA animation to be sync with idle animation
    (modify) ? modifyAnimationPosition(vrm ,clip) : null;

    const idleAction = this._currentAnimation!;

    const VRMAaction = mixer.clipAction(clip);
    VRMAaction.clampWhenFinished = true;
    VRMAaction.loop = THREE.LoopOnce;
    fadeToAction(idleAction, VRMAaction, 1);

    const restoreState = () => {
      mixer.removeEventListener("finished", restoreState);
      fadeToAction(VRMAaction, idleAction, 1);
    };

    mixer.addEventListener("finished", restoreState);
    return clip.duration;
  }

  public async playAutoWalk() {
    this._autoWalk?.autoWalk();
  }

  public update(delta: number, xr?: THREE.WebXRManager, camera?: THREE.PerspectiveCamera) {
    this.mixer?.update(delta);
    (xr) ? this._autoWalk?.update(delta, xr, camera) : this._autoWalk?.update(delta);

    //TODO: update camera delta
    
  }
}