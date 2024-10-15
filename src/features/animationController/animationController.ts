import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";
import { AutoWalk } from "./autoWalk";
import { loadMixamoAnimation } from "@/lib/VRMAnimation/loadMixamoAnimation";
import { clipAnimation, fadeToAction, modifyAnimationPosition } from "./animationUtils";


export class AnimationController {
  public vrm?: VRM;

  public _currentAction?: THREE.AnimationAction | null;

  private _currentAnimation?: THREE.AnimationAction | null;

  public mixer?: THREE.AnimationMixer;

  public autoWalk?: AutoWalk;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.autoWalk = new AutoWalk(vrm, this.mixer);
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
    Object.assign(VRMAaction, {
      clampWhenFinished: true,
      loop: THREE.LoopOnce,
    });
    fadeToAction(idleAction, VRMAaction, 1);

    const restoreState = () => {
      mixer.removeEventListener("finished", restoreState);
      fadeToAction(VRMAaction, idleAction, 1);
    };

    mixer.addEventListener("finished", restoreState);
    return clip.duration;
  }

  public async playBaseAnimation(animation: VRMAnimation | THREE.AnimationClip,): Promise<void> {
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

  public async playWalk() {
    this._currentAction = await this.autoWalk?.autoWalk(this._currentAction!);
  }

  public update(delta: number, xr?: THREE.WebXRManager, camera?: THREE.PerspectiveCamera) {
    this.mixer?.update(delta);
    (xr) ? this.autoWalk?.update(delta, xr, camera) : this.autoWalk?.update(delta);

  }
}