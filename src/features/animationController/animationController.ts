import * as THREE from "three";
import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { MotionController } from "./motionController";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";


export class AnimationController {
  private _motionController: MotionController;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer) {
    this._motionController = new MotionController(vrm, mixer);
  }

  public playBaseAnimation(animation: VRMAnimation | THREE.AnimationClip) {
    this._motionController.playBaseAnimation(animation);
  }
  
  public playAutoWalk() {
    this._motionController.playAutoWalk();
  }

  public async playSingleAnimation(url: VRMAnimation | THREE.AnimationClip, modify?: boolean): Promise<number> {
    modify = modify || false;
    return this._motionController.playSingleAnimation(url, modify);
  }

  public update(delta: number, xr?: THREE.WebXRManager, camera?: THREE.PerspectiveCamera) {
    (xr) ? this._motionController.update(delta, xr, camera) : this._motionController.update(delta);
  }
}