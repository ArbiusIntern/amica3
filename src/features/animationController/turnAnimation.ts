import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { fadeToAction, registerAction } from "./animationUtils";
import { AnimationController } from "./animationController";

// Rotation speed
const faceUserSpeed = 0.2;
const faceNewCenterSpeed = 0.2;

// Amplify the pitch angle for more pronounced tilt effect, This factor control the pitch intensity
const pitchAmplificationFactor = 1.5


export class TurnAnimation {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;

  public xr?: THREE.WebXRManager;
  public camera?: THREE.PerspectiveCamera;

  private _userPosition?: THREE.Vector3;
  private _userDirection?: THREE.Vector3;
  private _userRotation?: THREE.Quaternion;

  private _targetPosition?: THREE.Vector3;

  private _leftAction?: THREE.AnimationAction | null;
  private _rightAction?: THREE.AnimationAction | null;
  public _currentAction?: THREE.AnimationAction | null;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer) {
    this.vrm = vrm;
    this.mixer = mixer;
    this.registerAction()
  }

  public async registerAction() {
    this._leftAction = await registerAction("/animations/leftTurn.fbx", this.mixer, this.vrm)
    Object.assign(this._leftAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopOnce,
    });
    
    this._rightAction = await registerAction("/animations/rightTurn.fbx", this.mixer, this.vrm)
    Object.assign(this._rightAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopOnce,
    });
  }

  public async turnUp() {
    const modelPosition = this.vrm?.scene.position;

    if (modelPosition) {
      // Set the target position to 3 units above the current model position
      const targetPosition = modelPosition.clone().add(new THREE.Vector3(0, 3, 0)); // Look 3 units upward

      // Calculate the height difference and horizontal distance
      const targetHeightDifference = targetPosition.y - modelPosition.y;
      const distanceHorizontal = 0; // Looking directly up, so horizontal distance is zero

      // Calculate the pitch angle dynamically for upward tilt
      let pitchAngle = Math.atan2(targetHeightDifference, distanceHorizontal);
      const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(-1, 0, 0), // X-axis for pitch (upwards)
        pitchAngle / pitchAmplificationFactor // Amplified
      );

      // Smoothly rotate towards the new up quaternion
      this.vrm?.scene.quaternion.rotateTowards(pitchQuaternion, faceNewCenterSpeed);
    }
  }

  public async turnDown() {
    const modelPosition = this.vrm?.scene.position;

    if (modelPosition) {
      // Set the target position to 3 units above the current model position
      const targetPosition = modelPosition.clone().add(new THREE.Vector3(0, -3, 0)); // Look 3 units upward

      // Calculate the height difference and horizontal distance
      const targetHeightDifference = targetPosition.y - modelPosition.y;
      const distanceHorizontal = 0; // Looking directly down, so horizontal distance is zero

      // Calculate the pitch angle dynamically for upward tilt
      let pitchAngle = Math.atan2(targetHeightDifference, distanceHorizontal);
      const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(-1, 0, 0), // X-axis for pitch (downwards)
        pitchAngle / pitchAmplificationFactor // Amplified
      );

      // Smoothly rotate towards the new down quaternion
      this.vrm?.scene.quaternion.rotateTowards(pitchQuaternion, faceNewCenterSpeed);
    }
  }


  public async turnLeft(currentAction: THREE.AnimationAction){
    this._currentAction = currentAction;

    if (this._leftAction && this._currentAction !== this._leftAction) {
        fadeToAction(this._currentAction!, this._leftAction, 0.5);
        this._currentAction = this._leftAction;
      }
    return this._currentAction;
  }

  public async turnRight(currentAction: THREE.AnimationAction) {
    this._currentAction = currentAction;

    if (this._rightAction && this._currentAction !== this._rightAction) {
        fadeToAction(this._currentAction!, this._rightAction, 0.5);
        this._currentAction = this._rightAction;
      }
    return this._currentAction;
  }

  public async faceUser() {
    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
        const idleRotateQuaternion: THREE.Quaternion = new THREE.Quaternion();
        const idleAngleYCameraDirection = Math.atan2(
            this.camera?.position.x! - modelPosition.x,
            this.camera?.position.z! - modelPosition.z,
        );

        idleRotateQuaternion.setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            idleAngleYCameraDirection + Math.PI,
          );

        this.vrm?.scene.quaternion.rotateTowards(idleRotateQuaternion, faceUserSpeed);
    }
  }

  public async faceNewCenter() {
    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
        const walkTargetDirection = this._targetPosition!
        .clone()
        .sub(modelPosition)
        .normalize(); // Walk direction

        const walkRotateQuaternion: THREE.Quaternion = new THREE.Quaternion();

        // Set quaternions for walking and idle
        walkRotateQuaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1), // Model's default forward direction
        walkTargetDirection, // Direction to target
        );

        // Now calculate vertical angle (pitch) for up/down turning
        const targetHeightDifference = this._targetPosition!.y - modelPosition.y;
        const distanceHorizontal = Math.sqrt(
        Math.pow(this._targetPosition!.x - modelPosition.x, 2) +
        Math.pow(this._targetPosition!.z - modelPosition.z, 2)
        );

        // Calculate pitch (X-axis rotation)
        let pitchAngle = Math.atan2(targetHeightDifference, distanceHorizontal);
        pitchAngle /= pitchAmplificationFactor;

        const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(-1, 0, 0), // X-axis for pitch
        pitchAngle
        );

        // Choose the correct rotation based on state
        walkRotateQuaternion.multiply(pitchQuaternion); // Combine pitch and yaw for walking
    
        // Rotate the model using the final rotation quaternion
        this.vrm?.scene.quaternion.rotateTowards(walkRotateQuaternion, faceNewCenterSpeed);
    }
    
  }

  public autoTurn(state: "walk" | "idle") {
    if (state === "walk") {
      this.faceNewCenter();
    } else {
      this.faceUser();
    }
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
