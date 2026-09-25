import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useCloud, type CreateResult } from '@/hooks/use-cloud';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { validateCode, validateEmail, validatePassword } from '@/lib/auth';

type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
};

/** Every auth field shares one look: a rounded box with an optional button on the right. */
function Input({
  accessory,
  ...props
}: React.ComponentProps<typeof TextInput> & { accessory?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: theme.background }]}>
      <TextInput
        maxFontSizeMultiplier={1.4}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: theme.text }]}
        {...props}
      />
      {accessory}
    </View>
  );
}

export function EmailField({ value, onChange, onSubmit }: FieldProps) {
  return (
    <Input
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      placeholder="Email"
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      returnKeyType="next"
    />
  );
}

export function PasswordField({
  value,
  onChange,
  onSubmit,
  isNew,
}: FieldProps & { isNew?: boolean }) {
  const theme = useTheme();
  const [show, setShow] = useState(false);
  return (
    <Input
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      placeholder={isNew ? 'Password (8+ characters)' : 'Password'}
      secureTextEntry={!show}
      autoComplete={isNew ? 'new-password' : 'current-password'}
      textContentType={isNew ? 'newPassword' : 'password'}
      returnKeyType="go"
      accessory={
        <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} style={styles.show}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {show ? 'Hide' : 'Show'}
          </ThemedText>
        </Pressable>
      }
    />
  );
}

function CodeField({ value, onChange }: FieldProps) {
  return (
    <Input
      value={value}
      onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
      placeholder="Code from the email"
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={10}
    />
  );
}

export function PrimaryButton({
  label,
  busyLabel,
  busy,
  onPress,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.primary, { backgroundColor: theme.accent }, busy && styles.dim]}>
      <ThemedText type="smallBold" themeColor="onAccent">
        {busy ? busyLabel : label}
      </ThemedText>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.link} accessibilityRole="button">
      <ThemedText type="small" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ErrorText({ error }: { error: string | null }) {
  const theme = useTheme();
  if (!error) return null;
  return (
    <ThemedText type="small" style={{ color: theme.danger }}>
      {error}
    </ThemedText>
  );
}

/** Runs an async auth step with a busy flag and a friendly error line. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (problem: string | null, step: () => Promise<void>) => {
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    try {
      await step();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/**
 * Email + password sign-up. For a guest (anonymous) user this upgrades the same account, so
 * nothing is lost. If Supabase asks to confirm the email, a code field appears.
 */
export function CreateAccountForm({
  onDone,
  onSignInInstead,
  submitLabel = 'Create account',
}: {
  onDone: () => void;
  /** Shows "I already have an account", which leads to sign-in and password reset. */
  onSignInInstead?: () => void;
  submitLabel?: string;
}) {
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState<Exclude<CreateResult, 'done'> | null>(null);
  const { busy, error, setError, run } = useSubmit();

  const create = () =>
    run(validateEmail(email) ?? validatePassword(password), async () => {
      const result = await cloud.createAccount(email, password);
      if (result === 'done') onDone();
      else setVerify(result);
    });

  const confirm = () =>
    run(validateCode(code), async () => {
      await cloud.confirmEmail(verify!, email, code, password);
      onDone();
    });

  if (verify)
    return (
      <Animated.View entering={FadeIn} style={styles.form}>
        <ThemedText type="small" themeColor="textSecondary">
          We emailed a code to {email.trim()}. Enter it to finish.
        </ThemedText>
        <CodeField value={code} onChange={setCode} />
        <ErrorText error={error} />
        <PrimaryButton label="Confirm" busyLabel="Checking…" busy={busy} onPress={confirm} />
        <LinkButton label="Use a different email" onPress={() => setVerify(null)} />
      </Animated.View>
    );

  return (
    <View style={styles.form}>
      <EmailField
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(null);
        }}
      />
      <PasswordField
        isNew
        value={password}
        onChange={(v) => {
          setPassword(v);
          setError(null);
        }}
        onSubmit={create}
      />
      <ErrorText error={error} />
      <PrimaryButton label={submitLabel} busyLabel="Creating…" busy={busy} onPress={create} />
      {onSignInInstead && (
        <View style={styles.center}>
          <LinkButton label="I already have an account" onPress={onSignInInstead} />
        </View>
      )}
    </View>
  );
}

/**
 * Sign in to an existing account, with a "forgot password" path that emails a reset code.
 * Signing in replaces this phone's habits with the account's, so a guest with data is warned.
 */
export function SignInForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const cloud = useCloud();
  const { habits } = useHabits();
  const [mode, setMode] = useState<'signin' | 'forgot' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, setError, run } = useSubmit();

  /** Guests with habits on this phone confirm before the account's data replaces them. */
  const confirmReplace = (go: () => void) => {
    if (!habits.length || Platform.OS === 'web') return go();
    Alert.alert(
      'Replace this phone’s habits?',
      'Signing in loads your account’s habits. The ones on this phone aren’t linked to an account and will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', style: 'destructive', onPress: go },
      ]
    );
  };

  const signIn = () => {
    const problem = validateEmail(email) ?? (password ? null : 'Enter your password.');
    if (problem) return setError(problem);
    confirmReplace(() =>
      run(null, async () => {
        await cloud.signIn(email, password);
        onDone();
      })
    );
  };

  const sendCode = () =>
    run(validateEmail(email), async () => {
      await cloud.sendPasswordReset(email);
      setMode('reset');
    });

  const reset = () => {
    const problem = validateCode(code) ?? validatePassword(password);
    if (problem) return setError(problem);
    confirmReplace(() =>
      run(null, async () => {
        await cloud.resetPassword(email, code, password);
        onDone();
      })
    );
  };

  const switchTo = (next: typeof mode) => {
    setMode(next);
    setPassword('');
    setCode('');
    setError(null);
  };

  return (
    <Animated.View key={mode} entering={FadeIn} style={styles.form}>
      {mode !== 'signin' && (
        <ThemedText type="small" themeColor="textSecondary">
          {mode === 'forgot'
            ? 'We’ll email you a code to set a new password.'
            : `Enter the code we emailed to ${email.trim()} and choose a new password.`}
        </ThemedText>
      )}
      {mode !== 'reset' && (
        <EmailField
          value={email}
          onChange={(v) => {
            setEmail(v);
            setError(null);
          }}
        />
      )}
      {mode === 'reset' && <CodeField value={code} onChange={setCode} />}
      {mode !== 'forgot' && (
        <PasswordField
          isNew={mode === 'reset'}
          value={password}
          onChange={(v) => {
            setPassword(v);
            setError(null);
          }}
          onSubmit={mode === 'signin' ? signIn : reset}
        />
      )}
      <ErrorText error={error} />
      {mode === 'signin' && (
        <PrimaryButton label="Sign in" busyLabel="Signing in…" busy={busy} onPress={signIn} />
      )}
      {mode === 'forgot' && (
        <PrimaryButton
          label="Email me a code"
          busyLabel="Sending…"
          busy={busy}
          onPress={sendCode}
        />
      )}
      {mode === 'reset' && (
        <PrimaryButton
          label="Set password & sign in"
          busyLabel="Saving…"
          busy={busy}
          onPress={reset}
        />
      )}
      <View style={styles.links}>
        {mode === 'signin' ? (
          <LinkButton label="Forgot password?" onPress={() => switchTo('forgot')} />
        ) : (
          <LinkButton label="Back to sign in" onPress={() => switchTo('signin')} />
        )}
        {onCancel && <LinkButton label="Cancel" onPress={onCancel} />}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.two + 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderRadius: Spacing.three,
  },
  show: {
    paddingRight: Spacing.three,
  },
  primary: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  dim: {
    opacity: 0.5,
  },
  center: {
    alignItems: 'center',
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  link: {
    paddingVertical: Spacing.one,
  },
});
