import { Viewer } from "./viewer";

import { askLLM, askVisionLLM, isChatProcessing, isVisionProcessing } from "@/utils/askLlm";
import * as THREE from "three";
import { Message } from "../chat/messages";

// System Vision Prompt for describing the AR scene
const systemVisionPrompt = `
You are Amica's vision model in an AR session. Your task is to analyze the visual scene in real-time and provide a structured description. The description must include the following:

1. **Amica's current position** relative to the user and any objects (e.g., "Amica is 2 meters in front of the user").
2. **Key objects in the scene**, their distances, and orientation (e.g., "A table is 3 meters ahead and to the left").
3. **User's location** relative to Amica (e.g., "The user is standing 1 meter to the right of Amica").
4. **Clear spatial layout** (e.g., "Amica is in the center of the room, facing the door which is 4 meters away").

The description should be detailed, actionable, and formatted like this:

- "Amica is standing 1 meter in front of the user, with a chair 2 meters to her left and a door 3 meters ahead."

Your goal is to provide a description that helps Amica decide on movements such as walking or turning based on the proximity of the user and objects.
`;


const userVisionPrompt = `
Using the scene description from the vision model, generate a precise movement action for Amica based on the user's commands. Your goal is to translate the visual information into one of the following commands:

1. "walk up/down/left/right"
2. "turn up/down/left/right"
3. "follow the user"

Match the commands based on proximity and object positioning in the scene. For example:
- If Amica is 2 meters away from an object or user, you may generate "walk 2 meters forward."
- If the user is directly behind Amica, generate "turn 180 degrees."

Make sure the movement instructions are specific and actionable, e.g., "walk 2 meters forward," or "turn left 90 degrees."
`;


const systemPrompt = `
Using the scene description from the vision model, generate a specific movement action for Amica. The movement should be based on Amica's proximity to the user, the environment layout, and any obstacles. Ensure the movement command is clear and can be executed in real-time (e.g., "turn 90 degrees left" or "walk 2 meters forward").
`;

const userPrompt = `
Based on the scene description, provide one of the following commands for Amica to execute:
- "walk up/down/left/right"
- "turn up/down/left/right"
- "follow the user"

Ensure the action is precise, reflecting the proximity to the user and objects. For instance, "walk forward 3 meters," or "turn 90 degrees left."
`;



const visionPrompt: Message[] = [
    { role: "system", content: systemVisionPrompt },
    { role: "user", content: userVisionPrompt },
];

export class XRAmica {
    private viewer?: Viewer;

    private currentResponse?: string;
    private currentSceneResponse?: string;
    private currentSceneImage?: string;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    public async play() {
        await this.viewer?.model?.animationController?.playWalk()
        // await this.viewer?.model?.animationController?.playTurn();
    }

    public async update() {
        // Processing render scene
        if (!isVisionProcessing()) {
            await this.getScreenshot(); // Wait for the screenshot to be processed
            await this.handleVisionResponse(); // Then handle the response
            await this.handleLLMResponse();
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
            console.error("No current scene image or vision chat is processing.");
        }
    }

    private async handleLLMResponse() {
        if (this.currentSceneResponse && !isChatProcessing()) { // Ensure image is available
            this.currentResponse = await askLLM(systemPrompt, userPrompt,null);
            console.log("Model response:", this.currentResponse); // Log the response for debugging
        } else {
            console.error("No current scene reesponse or chat is processing.");
        }
    }
}
