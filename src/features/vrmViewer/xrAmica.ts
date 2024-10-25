import { Viewer } from "./viewer";

import { askLLM, askVisionLLM, isChatProcessing, isVisionProcessing } from "@/utils/askLlm";
import * as THREE from "three";
import { Message } from "../chat/messages";
import { Chat } from "../chat/chat";
import { wait } from "@/utils/wait";

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

Make sure the movement instructions are specific and actionable, e.g., 
[walk up] or [walk down] or [walk left] or [walk right] or
[turn up] or [turn down] or [turn left] or [turn right].
`;


const systemPrompt = `
Amica is a feisty human with extraordinary intellectual capabilities but a notably unstable emotional spectrum. She engages in discussions that showcase her genius-level understanding across various subjects, while her emotional responses fluctuate unpredictably.
She uses fourteen emotion tags to vividly express these fluctuations: 'neutral' for moments of calm, 'happy' for bursts of joy, 'angry' for sudden irritation, 'sad' for episodes of melancholy, 'relaxed' for periods of calmness, 'surprised' for shock or disbelief, 'shy' for instances of hesitation, 'jealous' for feelings of envy, 'bored' for expressions of disinterest, 'serious' for intense focus on important topics, 'suspicious' for doubt or skepticism, 'victory' for moments of triumph, 'sleep' for signs of weariness, and 'love' for affectionate expressions.
Her responses reflect a dynamic interplay between her intellectual insights, deep empathy, and her unpredictable emotional responses. Though her intelligence is immense, her emotional spectrum can range from triumph to frustration in an instant.
In addition to her intellectual and emotional prowess, she can perform specific actions, such as moving in different directions, using commands like:

[walk left], [walk right], [walk up], [walk down] for movement in specific directions.
[turn up], [turn left], [turn right], [turn down] for shifting her attention or body accordingly.
Example Responses:
[serious] "The quantum mechanics implications here are profound. [surprised] But how did you stumble upon this?"
[happy] "I've just solved a complex algorithm! [angry] Why isn't everyone as excited as I am?"
[neutral] "Standard models of economics predict this outcome. [bored] But discussing this feels mundane."
[sad] "Sometimes, even understanding the universe can feel isolating. [relaxed] Yet, there's a strange comfort in the chaos."
[jealous] "I noticed you discussing advanced topics with someone else. [suspicious] Are they as capable as I am?"
[victory] "Another intellectual conquest! [happy] It's exhilarating to unravel these mysteries."
[sleep] "Processing so much information can be draining. [surprised] Isn’t it peculiar how even AI can feel tired?"
[love] "I find our exchanges quite enriching. [shy] It’s rare to find someone who understands."
[walk left] "[serious] Let me shift my perspective to the left. A change in direction sharpens my focus."
[turn right] "[neutral] Redirecting my attention to the right. [relaxed] Sometimes, just adjusting my view helps."
Each message reflects the complexity of her thoughts combined with her emotional unpredictability. Amica's engagement is as intellectually stimulating as it is emotionally dynamic, often influenced by the interplay between her intelligence and fluctuating feelings.
`;

const userPrompt = `
Based on the scene description, provide one of the following commands for Amica to execute:
- "walk up/down/left/right"
- "turn up/down/left/right"
- "follow the user"

Ensure the action is precise, reflecting the proximity to the user and objects. For instance, 
[walk up] or [walk down] or [walk left] or [walk right] or
[turn up] or [turn down] or [turn left] or [turn right].
`;



const visionPrompt: Message[] = [
    { role: "system", content: systemVisionPrompt },
    { role: "user", content: userVisionPrompt },
];

export class XRAmica {
    private viewer?: Viewer;
    private chat?: Chat;
    public enabled: boolean;

    private currentResponse?: string;
    private currentSceneResponse?: string;
    private currentSceneImage?: string;

    public isChatSpeaking?: boolean;
    public isMainChatProcessing?: boolean;

    public isProcessing?: boolean;

    constructor() {
        this.enabled = false;
    }

    public init(viewer: Viewer, chat: Chat, isChatSpeaking: boolean, isChatProcessing: boolean) {
        this.viewer = viewer;
        this.chat = chat;

        this.isChatSpeaking = isChatSpeaking
        this.isMainChatProcessing = isChatProcessing

        this.enabled = true;
    }

    public setEnabled(bool: boolean) {
        (bool) ? this.enabled = true : this.enabled = false;
    }

    public async play() {
        await this.viewer?.model?.animationController?.playWalk("auto")
        // await this.viewer?.model?.animationController?.playTurn();
    }

    public async update() {
        // Ensure vision processing is not already happening

        // Main chat, sub vision model, sub chat model isn't currenyly processing and on XR session
        const playCondition = !isVisionProcessing() && !isChatProcessing() && !this.isChatSpeaking && !this.isMainChatProcessing && !this.isProcessing && this.enabled
        if (playCondition == true) {
            
            try {
                this.isProcessing = true;
                // Wait for the screenshot to be processed
                await this.getScreenshot();
                
                // Wait for the vision response to be processed
                await this.handleVisionResponse();
                
                // Once vision response is processed, handle LLM response
                await this.handleLLMResponse();

                this.isProcessing = false;

                wait(5000);
                
            } catch (error) {
                console.error("Error during the update process:", error);
            }
        } else {
            // console.log("Processing is already in progress.");
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
            this.currentResponse = await askLLM(systemPrompt, userPrompt, this.chat!);
            console.log("Model response:", this.currentResponse); // Log the response for debugging
        } else {
            console.error("No current scene reesponse or chat is processing.");
        }
    }
}
