import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
// @ts-ignore
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { config } from "@/utils/config";

export class Room {
  public room?: THREE.Group;
  public splat?: any;

  constructor() {
  }

  public async loadRoom(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    this.room = gltf.scene;
  }

  public async loadSplat(url: string): Promise<void> {
    this.splat = new GaussianSplats3D.DropInViewer({
      progressiveLoad: true,
      // freeIntermediateSplatData: true,
      // https://github.com/mkkellogg/GaussianSplats3D?tab=readme-ov-file#cors-issues-and-sharedarraybuffer
      sharedMemoryForWorkers: false,
      gpuAcceleratedSort: false,
    });
    return this.splat.addSplatScene(url, {
      // splatAlphaRemovalThreshold: 5,
      splatAlphaRemovalThreshold: 20,
      // scale: [3, 3, 3],
      // position: [0, -1, 0],
    });
  }
}
