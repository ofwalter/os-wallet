import { APP_TIMEZONE } from "@/lib/dates";

const NAME = "Owen";

// Each greeting gets ", Owen" appended, so write them to end mid-sentence.
const LATE_NIGHT = [
  "Burning the midnight oil",
  "Still up",
  "Night owl hours",
  "The ledger never sleeps, and apparently neither do you",
  "Quiet hours, loud numbers",
];

const MORNING = [
  "Good morning",
  "Rise and reconcile",
  "Morning! Coffee first, then cash flow",
  "Top of the morning",
  "Fresh day, fresh transactions",
  "Up and at 'em",
];

const AFTERNOON = [
  "Good afternoon",
  "Afternoon check-in",
  "Hey there",
  "Midday money moment",
  "Happy afternoon",
];

const EVENING = [
  "Good evening",
  "Evening",
  "Winding down",
  "Evening ledger review",
  "Hope today was kind to you",
];

const ANYTIME = [
  "Hello again",
  "Welcome back",
  "Nice to see you",
  "Ahoy",
  "Greetings, fellow budgeteer",
  "The numbers missed you",
  "Oh hi",
];

const TAGLINES = [
  "Here's where your money stands this month.",
  "Your dollars, sorted and accounted for.",
  "I counted everything twice. Here's the tally.",
  "Every cent in its place, more or less.",
  "Here's what your money got up to this month.",
  "A quick lap around your finances.",
  "The spreadsheet did the hard part. You get the charts.",
  "Numbers in, clarity out.",
  "Let's see where the money wandered off to.",
  "The month so far, minus the guesswork.",
  "Fresh from the bank, lightly categorized.",
  "Your money's monthly check-in, ready when you are.",
];

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** A time-aware greeting plus a tagline, picked fresh on each render. */
export function dashboardGreeting(now = new Date()): { title: string; description: string } {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: APP_TIMEZONE }).format(now),
  );
  const timed = hour < 5 ? LATE_NIGHT : hour < 12 ? MORNING : hour < 18 ? AFTERNOON : EVENING;
  // Mostly time-of-day greetings, with the occasional anytime one for variety.
  const greeting = pick(Math.random() < 0.7 ? timed : ANYTIME);
  return { title: `${greeting}, ${NAME}`, description: pick(TAGLINES) };
}
