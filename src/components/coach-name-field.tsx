import { useState } from 'react';

import { TextField } from '@/components/text-field';
import { useHabits } from '@/hooks/use-habits';

/** The name the coach greets you by. Saved when editing ends, not on every keystroke. */
export function CoachNameField({ onCard }: { onCard?: boolean }) {
  const { settings, updateSettings } = useHabits();
  const [name, setName] = useState(settings.name);
  const save = () => {
    const next = name.trim().slice(0, 30);
    if (next !== settings.name) updateSettings({ name: next });
  };
  return (
    <TextField
      onCard={onCard}
      value={name}
      onChangeText={setName}
      onEndEditing={save}
      onSubmitEditing={save}
      placeholder="Your first name"
      autoCapitalize="words"
      autoCorrect={false}
      textContentType="givenName"
      autoComplete="given-name"
      returnKeyType="done"
      maxLength={30}
    />
  );
}
