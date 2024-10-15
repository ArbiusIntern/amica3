import { Viewer } from "./viewer";

import { askVisionLLM, isVisionProcessing } from "@/utils/askLlm";
import * as THREE from "three";
import { Message } from "../chat/messages";

const systemVisionPrompt = `You are a vision model integrated with a virtual character named Amica. Your purpose is to analyze the visual scene in real time and help Amica interact autonomously with her environment based on user commands or camera input. Amica is able to understand commands like "turn to face user," "walk forward," "look left," or "sit down," and she can adjust her actions to match the scene context and proximity of the user. You are tasked with interpreting these commands and aligning them with the scene in front of you. You must also be capable of detecting when the camera is pointed at Amica and when she is close enough to trigger actions like turning around to face the user or moving autonomously based on the environment. Your goal is to assist Amica in creating a more immersive and interactive experience.`

const userVisionPrompt = `The user wants Amica to interact autonomously with her environment and respond to their commands. The following commands are possible: 
1. "turn to face user"
2. "walk up/down/left/right"
3. "sit/lay/stand"
4. "look at [object/direction]"
5. "follow the user" 
When the user is in frame, Amica should automatically turn towards them or interact with objects in her vicinity. Analyze the visual input to determine what actions Amica should take in real-time, while considering conversational context (if any) or environmental objects. Detect Amica's position in relation to the camera and the user.`

const visionPrompt: Message[] = [
    { role: "system", content: systemVisionPrompt },
    { role: "user", content: userVisionPrompt },
];

export class XRAmica {
    private viewer?: Viewer;

    private currentSceneResponse?: string;
    private currentSceneImage?: string;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    public async update() {
        // Play auto walk animation
        this.viewer?.model?.playWalk();
        
        // this.viewer?.model?.animationController?.playTurn("left");

        // Processing render scene
        if (!isVisionProcessing()) {
            await this.getScreenshot(); // Wait for the screenshot to be processed
            await this.handleVisionResponse(); // Then handle the response
        }
    }

    // Function to capture the current environment in screen
    private getScreenshot(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.viewer) {
                this.viewer.getScreenshotBlob((blob: Blob | null) => {
                    if (blob) {
                        // Convert the blob to a base64-encoded JPEG image
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const base64data = reader.result as string;
                            this.currentSceneImage = base64data.replace('data:image/jpeg;base64,', '');
                            resolve(); // Resolve the promise after the image is ready
                        };

                        // Read the Blob as a Data URL (base64 string)
                        reader.readAsDataURL(blob);
                    } else {
                        console.error("Failed to capture screenshot: Blob is null");
                        reject("Blob is null");
                    }
                });
            } else {
                reject("Viewer is not defined");
            }
        });
    }

    private async handleVisionResponse() {
        if (this.currentSceneImage && !isVisionProcessing()) { // Ensure image is available
            this.currentSceneResponse = await askVisionLLM(visionPrompt, this.currentSceneImage);
            console.log("Vision response:", this.currentSceneResponse); // Log the response for debugging
        } else {
            console.error("No current scene image or chat is processing.");
        }
    }
}
