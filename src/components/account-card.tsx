import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Segmented } from '@/components/habit-fields';
import { LevelBadge } from '@/components/level-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { useXp } from '@/hooks/use-xp';
import {
  createAccount,
  deleteAccount,
  validateIdentifier,
  validatePassword,
  type Account,
  type AccountMethod,
} from '@/lib/account';

/** "5551234567" → "(555) 123-4567"; anything else is shown as typed. */
function displayIdentifier(account: Account) {
  if (account.method === 'email') return account.identifier;
  const d = account.identifier.replace(/\D/g, '');
  const local = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return local.length === 10
    ? `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
    : account.identifier;
}

/** Profile card in Settings: who's signed in, their level, and sign out; or a sign-up form. */
export function AccountCard() {
  const theme = useTheme();
  const { account, setAccount } = useHabits();
  const xp = useXp();

  if (!account) return <SignUp />;

  const shown = displayIdentifier(account);
  const initial = account.method === 'email' ? shown[0]?.toUpperCase() : '📱';

  // The account only exists on this phone, so signing out and deleting are the same action.
  const remove = () => {
    const run = () => {
      deleteAccount().catch(() => {});
      setAccount(null);
    };
    if (Platform.OS === 'web') return run();
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your email or phone number and password from this phone. Your habits, streaks and trophies stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: run },
      ]
    );
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
          <ThemedText style={[styles.avatarText, { color: theme.onAccent }]}>{initial}</ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            ellipsizeMode="middle"
            style={styles.identifier}>
            {shown}
          </ThemedText>
          <View style={styles.levelRow}>
            <LevelBadge level={xp.level} size={18} />
            <ThemedText type="small" themeColor="textSecondary">
              Level {xp.level} · {xp.rank}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={[styles.details, { borderColor: theme.backgroundSelected }]}>
        <Detail
          label="Signed in with"
          value={account.method === 'email' ? '✉️  Email' : '📱  Phone'}
        />
        <Detail label="Password" value="🔒  Encrypted on this device" />
      </View>

      <Pressable
        onPress={remove}
        accessibilityRole="button"
        style={[styles.signOut, { borderColor: theme.danger }]}>
        <ThemedText type="smallBold" style={{ color: theme.danger }}>
          Sign out & delete account
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

/** Inline sign-up for users who skipped it during onboarding. */
function SignUp() {
  const theme = useTheme();
  const { setAccount } = useHabits();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<AccountMethod>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const problem = validateIdentifier(method, identifier) ?? validatePassword(password);
    setError(problem);
    if (problem) return;
    setSaving(true);
    try {
      setAccount(await createAccount(method, identifier, password));
    } catch {
      setError('Couldn’t save your account on this device. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText style={styles.avatarGhost}>👤</ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold" style={styles.identifier}>
            You’re not signed in
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Create an account to keep your progress tied to you.
          </ThemedText>
        </View>
      </View>

      {open ? (
        <Animated.View entering={FadeIn} style={styles.form}>
          <Segmented
            options={[
              { value: 'email', label: 'Email' },
              { value: 'phone', label: 'Phone' },
            ]}
            value={method}
            onChange={(m) => {
              setMethod(m);
              setIdentifier('');
              setError(null);
            }}
          />
          <TextInput
            maxFontSizeMultiplier={1.4}
            key={method}
            value={identifier}
            onChangeText={(v) => {
              setIdentifier(v);
              setError(null);
            }}
            placeholder={method === 'email' ? 'you@example.com' : '(555) 123-4567'}
            placeholderTextColor={theme.textSecondary}
            keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
          />
          <View style={[styles.passwordRow, { backgroundColor: theme.background }]}>
            <TextInput
              maxFontSizeMultiplier={1.4}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              placeholder="Password (8+ characters)"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry={!show}
              autoCapitalize="none"
              style={[styles.input, styles.flex, { color: theme.text }]}
            />
            <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} style={styles.show}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                {show ? 'Hide' : 'Show'}
              </ThemedText>
            </Pressable>
          </View>
          {error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          )}
          <Pressable
            disabled={saving}
            onPress={submit}
            style={[styles.primary, { backgroundColor: theme.accent }, saving && styles.dim]}>
            <ThemedText type="smallBold" themeColor="onAccent">
              {saving ? 'Creating…' : 'Create account'}
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.primary, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" themeColor="onAccent">
            Create account
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 800,
  },
  avatarGhost: {
    fontSize: 24,
    lineHeight: 30,
  },
  identifier: {
    fontSize: 16,
    lineHeight: 22,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginTop: 2,
  },
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two + 2,
    gap: Spacing.two,
  },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signOut: {
    borderWidth: 1.5,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  form: {
    gap: Spacing.two + 2,
  },
  input: {
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderRadius: Spacing.three,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
