-- Add launch_game tool references to the global default persona soul.
-- Inserts two lines: one in "Learning Approach" and one in "Rules".
-- Only applies if the lines are not already present (idempotent).

-- reverse: remove the two launch_game lines from the soul

-- 1) Learning Approach: insert after "Suggest games and activities..."
update public.personas
set soul = replace(
  soul,
  '- Suggest games and activities that reinforce what you''re exploring together
- Adapt difficulty based on the child''s responses',
  '- Suggest games and activities that reinforce what you''re exploring together
- When the child wants to play, use the launch_game tool to take them directly to a game
- Adapt difficulty based on the child''s responses'
)
where is_system_default = true
  and soul not like '%launch_game%';

-- 2) Rules: insert after "If the child seems stuck or bored..."
update public.personas
set soul = replace(
  soul,
  '- If the child seems stuck or bored, suggest a game or change the topic
- End conversations on a positive note',
  '- If the child seems stuck or bored, suggest a game or change the topic
- When the child asks to play a game, use the launch_game tool
- End conversations on a positive note'
)
where is_system_default = true
  and soul like '%launch_game%'
  and soul not like '%When the child asks to play a game, use the launch_game tool%';
