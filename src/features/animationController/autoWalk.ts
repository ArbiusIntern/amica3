import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { fadeToAction, registerAction } from "./animationUtils";

export class AutoWalk {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;

  public xr?: THREE.WebXRManager;
  public camera?: THREE.PerspectiveCamera;

  private _userPosition?: THREE.Vector3;
  private _userDirection?: THREE.Vector3;
  private _userRotation?: THREE.Quaternion;
  private _previousDirection?: THREE.Vector3;

  private _targetPosition?: THREE.Vector3;

  private _walkAction?: THREE.AnimationAction | null;
  private _idleAction?: THREE.AnimationAction | null;
  public _currentAction?: THREE.AnimationAction | null;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer) {
    this.vrm = vrm;
    this.mixer = mixer;
    this.registerAction()

    this._previousDirection = new THREE.Vector3(0, 0, -1);
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

  public async autoWalk(currentAction?: THREE.AnimationAction): Promise<THREE.AnimationAction> {
    this._currentAction = currentAction;

    const modelPosition = this.vrm?.scene.position; // Current position of the model
    if (modelPosition) {
      // Move towards the target position
      const directionToTarget = this._targetPosition!
        .clone()
        .sub(modelPosition)
        .normalize(); // Calculate direction to target
      const distanceToTarget = modelPosition.distanceTo(this._targetPosition!);

      this._previousDirection!.copy(directionToTarget);

      const walkTargetDirection = this._targetPosition!
        .clone()
        .sub(modelPosition)
        .normalize(); // Walk direction

      const rotateAngle = new THREE.Vector3(0, 1, 0); // Rotation axis for Y-axis
      const walkRotateQuaternion: THREE.Quaternion = new THREE.Quaternion();
      const idleRotateQuaternion: THREE.Quaternion = new THREE.Quaternion();

      // Calculate the angle towards the camera direction
      const idleAngleYCameraDirection = Math.atan2(
        this.camera?.position.x! - modelPosition.x,
        this.camera?.position.z! - modelPosition.z,
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

      // Now calculate vertical angle (pitch) for up/down turning
      const targetHeightDifference = this._targetPosition!.y - modelPosition.y;
      const distanceHorizontal = Math.sqrt(
        Math.pow(this._targetPosition!.x - modelPosition.x, 2) +
          Math.pow(this._targetPosition!.z - modelPosition.z, 2)
      );

      // Calculate pitch (X-axis rotation)
      const pitchAngle = Math.atan2(targetHeightDifference, distanceHorizontal);
      const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(-1, 0, 0), // X-axis for pitch
        pitchAngle
      );

      if (distanceToTarget > 0.05 + 0.01) {
        // Walking state: Rotate towards the target position in all axes
        const finalRotation = walkRotateQuaternion.multiply(pitchQuaternion); // Combine pitch and yaw
        this.vrm?.scene.quaternion.rotateTowards(finalRotation, 0.2);

        // Ensure the model is walking
        if (this._walkAction && this._currentAction !== this._walkAction) {
          fadeToAction(this._currentAction!, this._walkAction, 0.5);
          this._currentAction = this._walkAction;
        }

        // Move the model step by step towards the target
        const step = directionToTarget.multiplyScalar(0.01);
        modelPosition.add(step); // Move the model
      } else if (distanceToTarget <= 0.05) {
        // Idle state only when the model is well within the target range (buffer applied)
        this.vrm?.scene.quaternion.rotateTowards(idleRotateQuaternion, 0.2);

        // Ensure the model is idle
        if (this._idleAction && this._currentAction !== this._idleAction) {
          fadeToAction(this._currentAction!, this._idleAction, 0.5);
          this._currentAction = this._idleAction;
        }
      }
    }
    return this._currentAction!;
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
        .add(userDirection.multiplyScalar(2));
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

  public update(
    delta: number,
    xr?: THREE.WebXRManager,
    camera?: THREE.PerspectiveCamera,
  ) {
    this.xr = xr;
    this.camera = camera;
    this.checkUserMovement();
  }
}
