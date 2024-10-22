import { createContext } from "react";
import { XRAmica } from "./xrAmica";

const xrAmica = new XRAmica();

export const XRAmicaContext = createContext({ xrAmica });