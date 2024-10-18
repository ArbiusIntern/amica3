import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";
import { WalkAnimation } from "./walkAnimation";
import { clipAnimation, fadeToAction, modifyAnimationPosition } from "./animationUtils";
import { TurnAnimation } from "./turnAnimation";

// TODO: Fix animation positioning for transition between VRMA and Mixamo animation
export class AnimationController {
  public vrm?: VRM;
  public mixer?: THREE.AnimationMixer;

  public _currentAction?: THREE.AnimationAction | null;

  public walkAnimation?: WalkAnimation;
  public turnAnimation?: TurnAnimation;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.turnAnimation = new TurnAnimation(vrm);
    this.walkAnimation = new WalkAnimation(vrm, this.mixer, this.turnAnimation);
  }

  // Play turn animation to the desire direction
  public async playTurn(state: "left" | "right" | "up" | "down") {
    switch (state) {
      case "left":
        await this.turnAnimation?.turnLeft();
        break;

      case "right":
        await this.turnAnimation?.turnRight();
        break;

      case "down":
        await this.turnAnimation?.turnDown();
        break;
    
      default:
        await this.turnAnimation?.turnUp();
        break;
    }
  }

  // Play walk animation to the desire direction
  public async playWalk(state?: "left" | "right" | "up" | "down" | "auto") {
    switch (state) {
      case "left":
        this._currentAction = await this.walkAnimation?.walkLeft(this._currentAction!)
        break;

      case "right":
        this._currentAction = await this.walkAnimation?.walkRight(this._currentAction!)
        break;

      case "up":
        this._currentAction = await this.walkAnimation?.walkUp(this._currentAction!);
        break;

      case "down":
        this._currentAction = await this.walkAnimation?.walkDown(this._currentAction!)
        break;
    
      default:
        this._currentAction = await this.walkAnimation?.autoWalk(this._currentAction!);
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

  public update(delta: number, xr?: THREE.WebXRManager, camera?: THREE.PerspectiveCamera) {
    this.mixer?.update(delta);
    (xr) ? this.walkAnimation?.update(delta, xr, camera) : this.walkAnimation?.update(delta);
    (xr) ? this.turnAnimation?.update(delta, xr, camera) : this.turnAnimation?.update(delta);

  }
}