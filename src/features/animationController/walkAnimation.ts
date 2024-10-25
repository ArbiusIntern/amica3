import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { fadeToAction, registerAction } from "./animationUtils";
import { TurnAnimation } from "./turnAnimation";

const fadeDuration = 0.5;

export class WalkAnimation {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;

  public xr?: THREE.WebXRManager;
  public camera?: THREE.PerspectiveCamera;

  private _userPosition?: THREE.Vector3;
  private _userDirection?: THREE.Vector3;
  private _userRotation?: THREE.Quaternion;

  private _targetPosition?: THREE.Vector3;

  private _walkAction?: THREE.AnimationAction | null;
  private _idleAction?: THREE.AnimationAction | null;
  public _currentAction?: THREE.AnimationAction | null;

  public turnAnimation?: TurnAnimation;

  private targetDirection: THREE.Vector3 | null = null;
  private walkSpeed = 0.5;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer, turnAnimation: TurnAnimation) {
    this.vrm = vrm;
    this.mixer = mixer;
    this.registerAction()

    this.turnAnimation = turnAnimation;
  }

  public async registerAction() {
    this._walkAction = await registerAction("/animations/walking.fbx", this.mixer, this.vrm)
    Object.assign(this._walkAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopRepeat,
    });
    
    this._idleAction = await registerAction("/animations/idle.fbx", this.mixer, this.vrm)
    Object.assign(this._idleAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopRepeat,
    });
  }

  // Fade the current action to new action
  private playAction(action: THREE.AnimationAction) {
    if (action && this._currentAction !== action) {
      fadeToAction(this._currentAction!, action, fadeDuration);
      this._currentAction = action;
    }
  }

  // Walk up (move upwards, forward to users)
  public async walkUp(currentAction?: THREE.AnimationAction): Promise<THREE.AnimationAction> {
    this._currentAction = currentAction;

    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      await this.turnAnimation?.turnUp();
      this.playAction(this._walkAction!);
      this.targetDirection = modelPosition.clone().add(new THREE.Vector3(0, 0, 1)); 
    }
    return this.handleMovement();
  }

  // Move down (move away from users)
  public async walkDown(currentAction?: THREE.AnimationAction): Promise<THREE.AnimationAction> {
    this._currentAction = currentAction;

    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      await this.turnAnimation?.turnDown();
      this.playAction(this._walkAction!);
      this.targetDirection = modelPosition.clone().add(new THREE.Vector3(0, 0, -1)); 
    }
    return this.handleMovement();
  }

  public async walkLeft(currentAction?: THREE.AnimationAction): Promise<THREE.AnimationAction> {
    this._currentAction = currentAction;

    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      await this.turnAnimation?.turnLeft();
      this.playAction(this._walkAction!);
      this.targetDirection = modelPosition.clone().add(new THREE.Vector3(1, 0, 0)); 
    }
    return this.handleMovement();
  }

  public async walkRight(currentAction?: THREE.AnimationAction): Promise<THREE.AnimationAction> {
    this._currentAction = currentAction;

    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      await this.turnAnimation?.turnRight();
      this.playAction(this._walkAction!);
      this.targetDirection = modelPosition.clone().add(new THREE.Vector3(-1, 0, 0));
    }
    return this.handleMovement();
  }

  // Common function to handle movement after walk is complete
  private handleMovement(): Promise<THREE.AnimationAction> {
    return new Promise<THREE.AnimationAction>((resolve) => {
      const checkMovement = () => {
        if (!this.targetDirection) {
          resolve(this._currentAction!);
        } else {
          requestAnimationFrame(checkMovement);
        }
      };
      checkMovement();
    });
  }

  public async autoWalk(currentAction?: THREE.AnimationAction): Promise<THREE.AnimationAction> {
    this._currentAction = currentAction;

    const modelPosition = this.vrm?.scene.position; // Current position of the model
    if (modelPosition) {
      await this.turnAnimation?.autoTurn();
      this.playAction(this._walkAction!);
      this.targetDirection = this._targetPosition!.clone().sub(modelPosition).normalize();
    }
    return this.handleMovement();
  }

  private async checkUserMovement() {
    if (this.xr?.getFrame()) {
      this.getXRUserPositionAndRotation();

      // Get the camera's current position
      const cameraPosition =
        this.camera?.position.clone() || new THREE.Vector3();
      // Create a direction vector based on the camera's orientation
      const userDirection = new THREE.Vector3();

      // Set the user direction based on camera's rotation
      userDirection.set(0, 0, -1).applyQuaternion(this.camera!.quaternion);

      this._targetPosition = cameraPosition
        .clone()
        .add(userDirection.multiplyScalar(5));
    }
  }

  private getXRUserPositionAndRotation() {
    const pose = this.xr
      ?.getFrame()
      ?.getViewerPose(this.xr.getReferenceSpace()!);

    if (pose) {
      const userPose = pose.transform;
      // Extract position
      this._userPosition?.set(
        userPose.position.x,
        userPose.position.y,
        userPose.position.z,
      );
      // Extract rotation (as quaternion)
      this._userRotation?.set(
        userPose.orientation.x,
        userPose.orientation.y,
        userPose.orientation.z,
        userPose.orientation.w,
      );
      // Get user facing direction
      this._userDirection?.set(0, 0, -1).applyQuaternion(this._userRotation!);
    }
  }

  
  public update(delta: number, xr?: THREE.WebXRManager, camera?: THREE.PerspectiveCamera) {
    this.xr = xr;
    this.camera = camera;
    this.checkUserMovement();
  
    if (this.targetDirection && this.vrm) {
      const modelPosition = this.vrm?.scene.position;
      if (modelPosition) {
        // Calculate the step size based on walk speed and delta time
        const step = this.targetDirection.clone().sub(modelPosition).normalize().multiplyScalar(this.walkSpeed * delta);
        
        // Move the model towards the target direction
        modelPosition.add(step);
  
        // Check if the target has been reached (if close enough, stop movement)
        if (modelPosition.distanceTo(this.targetDirection) < 0.01) {
          this.targetDirection = null;
          this.turnAnimation?.turnUp();
          this.playAction(this._idleAction!);
        }
      }
    }
  }
  
}
