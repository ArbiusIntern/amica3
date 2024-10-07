import { VRM } from "@pixiv/three-vrm";
import {
  fadeToAction,
  clipAnimation,
} from "./animationUtils";
import * as THREE from "three";
import { loadMixamoAnimation } from "@/lib/VRMAnimation/loadMixamoAnimation";

const movementSpeed = 0.01;

export class AutoWalk {
  private vrm?: VRM;

  private refSpace?: XRReferenceSpace;
  private frame?: XRFrame;
  private camera?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;

  private _userPosition?: THREE.Vector3;
  private _userDirection?: THREE.Vector3;
  private _userRotation?: THREE.Quaternion;

  private _targetPosition?: THREE.Vector3;

  private _walkAction?: THREE.AnimationAction;
  private _idleAction?: THREE.AnimationAction;
  private _currentAction?: THREE.AnimationAction;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer, camera: THREE.Object3D) {
    this.vrm = vrm;
    this.mixer = mixer;
    this.camera = camera;
    this.registerAnimation();
  }

  private async registerAnimation() {
    const { mixer } = this;
    if (mixer == null) {
      throw new Error("You have to load VRM first");
    }

    //Loaded walking animation
    const walkAnimation = await loadMixamoAnimation(
      "/animations/walking.fbx",
      this.vrm!,
    );
    if (walkAnimation) {
      const clip = await clipAnimation(this.vrm!, walkAnimation);
      this._walkAction = this.mixer!.clipAction(clip);
      Object.assign(this._walkAction, {
        clampWhenFinished: true,
        loop: THREE.LoopRepeat,
      });
    }

    const idleAnimation = await loadMixamoAnimation(
      "/animations/idle.fbx",
      this.vrm!,
    );
    if (idleAnimation) {
      const clip = await clipAnimation(this.vrm!, idleAnimation);
      this._idleAction = this.mixer!.clipAction(clip);
      Object.assign(this._idleAction, {
        clampWhenFinished: true,
        loop: THREE.LoopRepeat,
      });
    }
  }

  private async checkUserMovement() {
    if (this.frame) {
      this.getXRUserPositionAndRotation();

      // Get the camera's current position
      const cameraPosition =
        this.camera?.position.clone() || new THREE.Vector3();
      // Create a direction vector based on the camera's orientation
      const userDirection = new THREE.Vector3();

      // Set the user direction based on camera's rotation
      userDirection.set(0, 0, -1).applyQuaternion(this.camera!.quaternion);

      // Define how far in front of the camera the model should be positioned
      const offsetDistance = 2; // Adjust as needed
      this._targetPosition = cameraPosition
        .clone()
        .add(userDirection.multiplyScalar(offsetDistance));
    }
  }

  public getXRUserPositionAndRotation() {
    const pose = this.frame?.getViewerPose(this.refSpace!);

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

  public async autoWalk(): Promise<void> {
    // Move towards the target position
    const modelPosition = this.vrm?.scene.position; // Current position of the model
    if (modelPosition) {
      const directionToTarget = this._targetPosition!.clone()
        .sub(modelPosition)
        .normalize(); // Calculate direction to target
      const distanceToTarget = modelPosition.distanceTo(this._targetPosition!);

      // Introduce a buffer to avoid flickering between walking and idle states
      const nearTargetThreshold = 0.1;
      const idleSwitchBuffer = 0.1; // Buffer zone to prevent flickering

      const walkTargetDirection = this._targetPosition!.clone()
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

      if (distanceToTarget > nearTargetThreshold + idleSwitchBuffer) {
        // Walking state: Rotate towards the target position in all axes
        this.vrm?.scene.quaternion.rotateTowards(walkRotateQuaternion, 0.2);

        // Ensure the model is walking
        if (this._walkAction && this._currentAction !== this._walkAction) {
          fadeToAction(this._currentAction!, this._walkAction, 0.5);
          this._currentAction = this._walkAction;
        }

        // Move the model step by step towards the target
        const step = directionToTarget.multiplyScalar(movementSpeed);
        modelPosition.add(step); // Move the model
      } else if (distanceToTarget <= nearTargetThreshold) {
        // Idle state only when the model is well within the target range (buffer applied)
        this.vrm?.scene.quaternion.rotateTowards(idleRotateQuaternion, 0.2);

        // Ensure the model is idle
        if (this._idleAction && this._currentAction !== this._idleAction) {
          fadeToAction(this._currentAction!, this._idleAction, 0.5);
          this._currentAction = this._idleAction;
        }
      }
    }
  }

  public setEnable() {
    
  }

  public update(
    delta: number,
    xr?: THREE.WebXRManager,
    camera?: THREE.Object3D,
  ) {

    if (xr && xr.getFrame() && xr.getReferenceSpace() && camera) {
      this.frame = xr.getFrame();
      this.refSpace = xr.getReferenceSpace()!;
      this.camera = camera;

      this.checkUserMovement();
      this.getXRUserPositionAndRotation();
    }
  }
}
