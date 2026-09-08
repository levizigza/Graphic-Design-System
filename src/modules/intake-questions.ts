/**
 * Intake questionnaire prompts for Graphic Design System operators.
 * Use polished, confident, human, clear, sales-focused language.
 * Never invent facts — leave an answer blank rather than guess.
 */

export const INTAKE_QUESTIONS = [
  {
    id: 1,
    key: "offer",
    prompt: "What does the organization offer?",
    guidance: "State the product, service, or event in plain language. No features you cannot verify.",
  },
  {
    id: 2,
    key: "whoNeedsIt",
    prompt: "Who needs it?",
    guidance: "Name the primary buyer or visitor. Add secondary audiences only if they are real.",
  },
  {
    id: 3,
    key: "purchaseTrigger",
    prompt: "What situation triggers the purchase?",
    guidance: "Describe the moment or pressure that makes them look for this offer now.",
  },
  {
    id: 4,
    key: "twoSecondUnderstanding",
    prompt: "What should the viewer understand in two seconds?",
    guidance: "One clear takeaway. Not a slogan list.",
  },
  {
    id: 5,
    key: "nextAction",
    prompt: "What should the viewer do next?",
    guidance: "A single concrete action (RSVP, call, visit, buy).",
  },
  {
    id: 6,
    key: "copyAndClaims",
    prompt: "What is the exact approved copy, and which claims are prohibited?",
    guidance: "Paste locked copy only. List claims that must never appear.",
  },
  {
    id: 7,
    key: "brandAssets",
    prompt: "Which brand assets are required, and what variation is permitted?",
    guidance: "Mark fixed, distinctive, variable, and approval-required assets. Include licenses.",
  },
  {
    id: 8,
    key: "outputs",
    prompt: "Which output formats and production constraints apply?",
    guidance: "Sizes, bleed, color mode, accessibility, localization — hard constraints only.",
  },
] as const;

export const PROJECT_DISPLAY_NAME = "Graphic Design System";
