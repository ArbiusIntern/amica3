import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";
import { AutoWalk } from "./autoWalk";
import { loadMixamoAnimation } from "@/lib/VRMAnimation/loadMixamoAnimation";
import { clipAnimation, fadeToAction, modifyAnimationPosition } from "./animationUtils";
import { TurnAnimation } from "./turnAnimation";


export class AnimationController {
  public vrm?: VRM;
  public mixer?: THREE.AnimationMixer;

  public _currentAction?: THREE.AnimationAction | null;

  public autoWalk?: AutoWalk;
  public turnAnimation?: TurnAnimation;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.turnAnimation = new TurnAnimation(vrm, this.mixer);
    this.autoWalk = new AutoWalk(vrm, this.mixer, this.turnAnimation);
  }

  public async playTurn(state: "left" | "right" | "user") {
    switch (state) {
      case "left":
        this._currentAction = await this.turnAnimation?.turnLeft()
        break;

      case "right":
        this._currentAction = await this.turnAnimation?.turnRight()
        break;
    
      default:
        await this.turnAnimation?.faceUser()
        break;
    }
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

    const currentAction = this._currentAction!;

    const newAction = mixer.clipAction(clip);
    Object.assign(newAction, {
      clampWhenFinished: true,
      loop: THREE.LoopOnce,
    });
    fadeToAction(currentAction, newAction, 1);

    const restoreState = () => {
      mixer.removeEventListener("finished", restoreState);
      fadeToAction(newAction, currentAction, 1);
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
    (xr) ? this.turnAnimation?.update(delta, xr, camera) : this.turnAnimation?.update(delta);

  }
}