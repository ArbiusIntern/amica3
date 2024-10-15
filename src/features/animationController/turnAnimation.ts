import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { fadeToAction, registerAction } from "./animationUtils";

export class TurnAnimation {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;

  public xr?: THREE.WebXRManager;
  public camera?: THREE.PerspectiveCamera;

  private _userPosition?: THREE.Vector3;
  private _userDirection?: THREE.Vector3;
  private _userRotation?: THREE.Quaternion;
  private _previousDirection?: THREE.Vector3;

  private _targetPosition?: THREE.Vector3;

  private _leftAction?: THREE.AnimationAction | null;
  private _rightAction?: THREE.AnimationAction | null;
  public _currentAction?: THREE.AnimationAction | null;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer) {
    this.vrm = vrm;
    this.mixer = mixer;
    this.registerAction()

    this._previousDirection = new THREE.Vector3(0, 0, -1);
  }

  public async registerAction() {
    this._leftAction = await registerAction("/animations/leftTurn.fbx", this.mixer, this.vrm)
    Object.assign(this._leftAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopRepeat,
    });
    
    this._rightAction = await registerAction("/animations/rightTurn.fbx", this.mixer, this.vrm)
    Object.assign(this._rightAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopRepeat,
    });
  }

  public turnLeft() {

  }

  public turnRight() {
    
  }
 


  public update(
    delta: number,
    xr?: THREE.WebXRManager,
    camera?: THREE.PerspectiveCamera,
  ) {
    this.xr = xr;
    this.camera = camera;
  }
}
