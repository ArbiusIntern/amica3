import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";

// Create animation clip from animation 
export async function clipAnimation(vrm: VRM, animation: VRMAnimation | THREE.AnimationClip): Promise<THREE.AnimationClip> {
    if (vrm == null) {
      throw new Error("You have to load VRM first");
    }

    const clip =
      animation instanceof THREE.AnimationClip
        ? animation
        : animation.createAnimationClip(vrm);    
    return clip;
  }

export async function fadeToAction(currentAction: THREE.AnimationAction, destAction: THREE.AnimationAction, duration: number) {
    let previousAction = currentAction;
    currentAction = destAction;

    if (previousAction !== currentAction) {
      previousAction?.fadeOut(duration);
    }

    currentAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(0.5)
      .play();
}

export async function modifyAnimationPosition(vrm: VRM, clip: THREE.AnimationClip) {
    if (vrm == null) {
      throw new Error("You have to load VRM first");
    }

    // Find the hips bone
    const hipsBone = vrm.humanoid.getNormalizedBoneNode("hips");

    if (!hipsBone) {
      throw new Error("Bone not found in VRM model");
    }

    // Use the current hips bone position as the start position
    const currentHipsPosition = hipsBone!.getWorldPosition(new THREE.Vector3());

    // Extract the start position from the animation clip
    let clipStartPositionHips: THREE.Vector3 | null = null;

    for (const track of clip.tracks) {
      if (track.name.endsWith(".position") && track.name.includes("Hips")) {
        const values = (track as THREE.VectorKeyframeTrack).values;
        clipStartPositionHips = new THREE.Vector3(
          values[0],
          values[1],
          values[2],
        );
        break;
      }
    }

    if (clipStartPositionHips) {
      // Calculate the offset
      const offsetHips = currentHipsPosition.clone().sub(clipStartPositionHips);

      // Apply the offset to all keyframes
      for (const track of clip.tracks) {
        if (track.name.endsWith(".position") && track.name.includes("Hips")) {
          const values = (track as THREE.VectorKeyframeTrack).values;
          for (let i = 0; i < values.length; i += 3) {
            // values[i] += offsetHips.x;
            values[i + 1] += offsetHips.y;
            // values[i + 2] -= offsetHips.z;
          }
        }
      }
    } else {
      console.warn("Could not determine start position from animation clip.");
    }
  }