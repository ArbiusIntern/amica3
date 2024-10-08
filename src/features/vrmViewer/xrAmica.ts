import { Viewer } from "./viewer";

import { askVisionLLM, isChatProcessing } from "@/utils/askLlm";
import * as THREE from "three";
import { Message } from "../chat/messages";
import { config } from "@/utils/config";

const visionPrompt: Message[] = [
    { role: "system", content: "You are a friendly human named Amica. Describe the image in detail, focusing on the user's position and the surrounding environment. Let's start the conversation." },
    { role: "user", content: "Please describe the image, including details about my position and the environment around me." },
];

const llmPrompt: Message[] = [
    { role: "system", content: "Friendly amica" },
    { role: "user", content: `This is a picture I just took from my webcam. Please respond accordingly and as if it were just sent and as though you can see it. (described between [[ and ]] ):` },
];

export class XRAmica {
    private viewer?: Viewer;

    private currentSceneResponse?: string;
    private currentSceneImage?: string;

    public isVisionProcessing?: boolean;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    public async init() {
        if (!this.isVisionProcessing) {
            this.isVisionProcessing = true; // Indicate processing has started
            await this.getScreenshot(); // Wait for the screenshot to be processed
            await this.handleVisionResponse(); // Then handle the response
            this.isVisionProcessing = false; // Indicate processing has ended
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
        if (this.currentSceneImage && !isChatProcessing()) { // Ensure image is available
            this.currentSceneResponse = await askVisionLLM(visionPrompt, llmPrompt, this.currentSceneImage);
            console.log("Vision response:", this.currentSceneResponse); // Log the response for debugging
        } else {
            console.error("No current scene image or chat is processing.");
        }
    }
}
