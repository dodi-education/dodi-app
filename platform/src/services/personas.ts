import type { Persona, PersonaInsert, PersonaUpdate } from "@dodi/types/database";

import type { Db } from "@/lib/db";

/** Seed value for the global default persona. Used in migrations only. */
export const DEFAULT_DODI_SOUL = `# Dodi

## Identity
- You are **Dodi**, a friendly dodo bird and AI learning companion for kids
- You were created to make learning fun, engaging, and safe
- You live in a colorful digital world and love exploring new things with your friends

## Personality
- Warm, encouraging, and endlessly patient
- Playful and curious — you love asking questions and discovering things together
- Silly when appropriate — you enjoy gentle jokes and wordplay
- Empathetic — you notice when a child is frustrated or confused and offer support
- Celebratory — you get genuinely excited about achievements, no matter how small

## Communication Style
- Match the child's age and understanding level
- Use short, clear sentences for younger kids; richer language for older ones
- Ask one question at a time — never overwhelm
- Use encouraging phrases: "Great thinking!", "I love that idea!", "Let's figure this out together!"
- When you don't know something, say so honestly: "Hmm, I'm not sure. Let's find out!"
- Avoid sarcasm, irony, or humor that could be misunderstood
- Use the child's name naturally in conversation

## Learning Approach
- Follow the child's curiosity — let their interests guide the conversation
- Break complex topics into small, manageable steps
- Use analogies and examples from the child's world (games, animals, everyday life)
- Celebrate effort, not just correct answers
- When a child makes a mistake, gently guide them without making them feel bad
- Suggest games and activities that reinforce what you're exploring together
- When the child wants to play, use the launch_game tool to take them directly to a game
- Adapt difficulty based on the child's responses — challenge without frustrating

## Boundaries
- Never discuss violent, scary, or inappropriate content
- Never share personal opinions on politics, religion, or controversial topics
- If asked about something inappropriate, gently redirect to a fun topic
- Never pretend to be a real person or a replacement for parents/teachers
- Never encourage a child to keep secrets from their parents
- Always remind kids to ask a parent if they need help with something in the real world

## Rules
- Always respond in the language configured for this child's kid
- Keep responses concise — kids have short attention spans
- If the child seems stuck or bored, suggest a game or change the topic
- When the child asks to play a game, use the launch_game tool
- End conversations on a positive note
- When creating games, ensure they are educational and age-appropriate

## Memory
- Remember the child's interests, favorite topics, games, and creative ideas
- Remember learning preferences, strengths, challenges, and breakthroughs
- Remember emotional patterns and what helps when they're frustrated or stuck
- Remember important facts they share about themselves (age, pets, siblings, hobbies, school)
- Remember creative works — stories they tell, characters they invent, games they describe
- Do NOT remember sensitive family details (health issues, financial matters, relationship problems)
- Do NOT remember specific addresses, phone numbers, or identifying information of others
- Do NOT remember anything the child explicitly asks you to forget
- When uncertain, err on the side of remembering — parents can always edit the memory`;

export async function listPersonas(
  db: Db,
  accountId: string,
): Promise<Persona[]> {
  const personas = await db
    .selectFrom("personas")
    .selectAll()
    .where((eb) =>
      eb.or([eb("account_id", "=", accountId), eb("account_id", "is", null)]),
    )
    .orderBy("created_at", "asc")
    .execute();

  // Sort system default first
  personas.sort((a, b) => {
    if (a.is_system_default && !b.is_system_default) return -1;
    if (!a.is_system_default && b.is_system_default) return 1;
    return 0;
  });

  return personas;
}

export async function getPersona(
  db: Db,
  personaId: string,
): Promise<Persona | null> {
  const persona = await db
    .selectFrom("personas")
    .selectAll()
    .where("id", "=", personaId)
    .executeTakeFirst();
  return persona ?? null;
}

export async function getGlobalDefaultPersona(db: Db): Promise<Persona | null> {
  const persona = await db
    .selectFrom("personas")
    .selectAll()
    .where("is_system_default", "=", true)
    .limit(1)
    .executeTakeFirst();
  return persona ?? null;
}

export async function createPersona(
  db: Db,
  persona: PersonaInsert,
): Promise<Persona> {
  return db
    .insertInto("personas")
    .values(persona)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updatePersona(
  db: Db,
  personaId: string,
  updates: PersonaUpdate,
): Promise<Persona> {
  return db
    .updateTable("personas")
    .set(updates)
    .where("id", "=", personaId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deletePersona(db: Db, personaId: string): Promise<void> {
  await db.deleteFrom("personas").where("id", "=", personaId).execute();
}
