import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { fadeToAction, registerAction } from "./animationUtils";
import { AnimationController } from "./animationController";
import { wait } from "@/utils/wait";

// Rotation speed
const faceUserSpeed = 0.2;
const faceNewCenterSpeed = 0.2;

// Amplify the pitch angle for more pronounced tilt effect, This factor control the pitch intensity
const pitchAmplificationFactor = 1.5;

export class TurnAnimation {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;

  public xr?: THREE.WebXRManager;
  public camera?: THREE.PerspectiveCamera;

  private _userPosition?: THREE.Vector3;
  private _userDirection?: THREE.Vector3;
  private _userRotation?: THREE.Quaternion;

  private _targetPosition?: THREE.Vector3;

  private _idleAction?: THREE.AnimationAction | null;
  private _leftAction?: THREE.AnimationAction | null;
  private _rightAction?: THREE.AnimationAction | null;
  public _currentAction?: THREE.AnimationAction | null;

  private targetQuaternion: THREE.Quaternion | null = null;
  private rotationSpeed = 3;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer) {
    this.vrm = vrm;
    this.mixer = mixer;
    this.registerAction();
  }

  public async registerAction() {
    this._leftAction = await registerAction(
      "/animations/leftTurn.fbx",
      this.mixer,
      this.vrm,
    );
    Object.assign(this._leftAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopOnce,
    });

    this._rightAction = await registerAction(
      "/animations/rightTurn.fbx",
      this.mixer,
      this.vrm,
    );
    Object.assign(this._rightAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopOnce,
    });

    this._idleAction = await registerAction(
      "/animations/idle.fbx",
      this.mixer,
      this.vrm,
    );
    Object.assign(this._idleAction!, {
      clampWhenFinished: true,
      loop: THREE.LoopRepeat,
    });
  }

  // Common function to handle movement after turn is complete
  private handleMovement(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkMovement = () => {
        if (!this.targetQuaternion) {
          resolve();
        } else {
          requestAnimationFrame(checkMovement);
        }
      };
      checkMovement();
    });
  }

  public async turnLeft() {
    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      const idleAngleYCameraDirection = Math.atan2(
        this.camera?.position.x! - modelPosition.x,
        this.camera?.position.z! - modelPosition.z,
      );

      // Calculate the target quaternion for left turn
      this.targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        idleAngleYCameraDirection - Math.PI / 2, // Turning left
      );
    }
    return this.handleMovement();
  }

  public async turnRight() {
    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      const idleAngleYCameraDirection = Math.atan2(
        this.camera?.position.x! - modelPosition.x,
        this.camera?.position.z! - modelPosition.z,
      );

      // Calculate the target quaternion for right turn
      this.targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        idleAngleYCameraDirection + Math.PI / 2, // Turning right
      );
    }
    return this.handleMovement();
  }

  public async turnUp() {
    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      const idleAngleYCameraDirection = Math.atan2(
        this.camera?.position.x! - modelPosition.x,
        this.camera?.position.z! - modelPosition.z,
      );

      // Calculate the target quaternion for away from user
      this.targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        idleAngleYCameraDirection + Math.PI, // Turning up
      );
    }
    return this.handleMovement();
  }

  public async turnDown() {
    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      const idleAngleYCameraDirection = Math.atan2(
        this.camera?.position.x! - modelPosition.x,
        this.camera?.position.z! - modelPosition.z,
      );

      // Calculate the target quaternion for forward user
      this.targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        idleAngleYCameraDirection,
      );
    }
    return this.handleMovement();
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

      this.vrm?.scene.quaternion.rotateTowards(
        idleRotateQuaternion,
        faceUserSpeed,
      );
    }
  }

  public async faceNewCenter() {
    const modelPosition = this.vrm?.scene.position;
    if (modelPosition) {
      const walkTargetDirection = this._targetPosition!.clone()
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
          Math.pow(this._targetPosition!.z - modelPosition.z, 2),
      );

      // Calculate pitch (X-axis rotation)
      let pitchAngle = Math.atan2(targetHeightDifference, distanceHorizontal);
      pitchAngle /= pitchAmplificationFactor;

      const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(-1, 0, 0), // X-axis for pitch
        pitchAngle,
      );

      // Choose the correct rotation based on state
      walkRotateQuaternion.multiply(pitchQuaternion); // Combine pitch and yaw for walking

      // Rotate the model using the final rotation quaternion
      this.vrm?.scene.quaternion.rotateTowards(
        walkRotateQuaternion,
        faceNewCenterSpeed,
      );
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

    if (this.targetQuaternion && this.vrm) {
      // Smoothly rotate towards the target quaternion
      this.vrm.scene.quaternion.rotateTowards(
        this.targetQuaternion,
        this.rotationSpeed * delta,
      );

      // Check if rotation is complete (within a small threshold)
      if (this.vrm.scene.quaternion.angleTo(this.targetQuaternion) < 0.01) {
        this.targetQuaternion = null; // Stop rotating once target is reached
      }
    }
  }
}
