import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CreateAccountForm, LinkButton, PrimaryButton, SignInForm } from '@/components/auth-forms';
import { LevelBadge } from '@/components/level-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCloud, type CloudStatus } from '@/hooks/use-cloud';
import { useTheme } from '@/hooks/use-theme';
import { useXp } from '@/hooks/use-xp';

const STATUS: Record<CloudStatus, string> = {
  off: '📱  On this phone only',
  'signed-out': '📱  On this phone only',
  syncing: '🔄  Syncing…',
  synced: '✅  Up to date',
  offline: '📴  Offline, will sync later',
  error: '⚠️  Sync problem, retrying',
};

/** Profile card in Settings: the signed-in account, or sign-up / sign-in for guests. */
export function AccountCard() {
  const theme = useTheme();
  const cloud = useCloud();
  const xp = useXp();
  const [busy, setBusy] = useState(false);

  if (!cloud.user || cloud.user.anonymous || !cloud.user.email) return <Guest />;
  const email = cloud.user.email;

  const confirm = (title: string, message: string, action: string, run: () => void) => {
    if (Platform.OS === 'web') return run();
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: run },
    ]);
  };

  const signOut = async () => {
    setBusy(true);
    const synced = await cloud.flush();
    setBusy(false);
    confirm(
      'Sign out?',
      synced
        ? 'Your habits stay safe in your account. Sign in again anytime to get them back.'
        : 'Some recent changes haven’t reached the cloud yet (you may be offline). Signing out now loses them.',
      'Sign out',
      () => void cloud.signOut()
    );
  };

  const remove = () =>
    confirm(
      'Delete your account?',
      'This permanently deletes your account and all of your habits, history and trophies, on this phone and in the cloud. It can’t be undone.',
      'Delete account',
      async () => {
        setBusy(true);
        try {
          await cloud.deleteEverything();
        } catch (e) {
          Alert.alert('Couldn’t delete your account', (e as Error).message);
        } finally {
          setBusy(false);
        }
      }
    );

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
          <ThemedText style={[styles.avatarText, { color: theme.onAccent }]}>
            {email[0]?.toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            ellipsizeMode="middle"
            style={styles.identifier}>
            {email}
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
        <Detail label="Signed in with" value="✉️  Email" />
        <Detail label="Backup" value={STATUS[cloud.status]} />
      </View>

      <Pressable
        disabled={busy}
        onPress={signOut}
        accessibilityRole="button"
        style={[styles.signOut, { borderColor: theme.backgroundSelected }, busy && styles.dim]}>
        <ThemedText type="smallBold">{busy ? 'One moment…' : 'Sign out'}</ThemedText>
      </Pressable>
      <Pressable disabled={busy} onPress={remove} accessibilityRole="button" style={styles.delete}>
        <ThemedText type="small" style={{ color: theme.danger }}>
          Delete account
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

/** Not signed in to an email account: explain the backup and offer sign-up or sign-in. */
function Guest() {
  const theme = useTheme();
  const cloud = useCloud();
  const [form, setForm] = useState<'create' | 'signin' | null>(null);

  const body = !cloud.configured
    ? 'Your habits are saved on this phone.'
    : cloud.user?.anonymous
      ? 'Your habits are backed up to a guest account. Add an email so you can sign in on a new phone.'
      : 'Create an account to back up your habits and sign in on any phone.';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText style={styles.avatarGhost}>👤</ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold" style={styles.identifier}>
            {cloud.user?.anonymous ? 'Guest' : 'You’re not signed in'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {body}
          </ThemedText>
        </View>
      </View>

      {cloud.configured &&
        (form === 'create' ? (
          <Animated.View entering={FadeIn} style={styles.form}>
            <CreateAccountForm
              onDone={() => setForm(null)}
              onSignInInstead={() => setForm('signin')}
            />
            <LinkButton label="Cancel" onPress={() => setForm(null)} />
          </Animated.View>
        ) : form === 'signin' ? (
          <SignInForm onDone={() => setForm(null)} onCancel={() => setForm(null)} />
        ) : (
          <View style={styles.form}>
            <PrimaryButton
              label="Create account"
              busyLabel=""
              busy={false}
              onPress={() => setForm('create')}
            />
            <Pressable
              onPress={() => setForm('signin')}
              accessibilityRole="button"
              style={styles.delete}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                I already have an account
              </ThemedText>
            </Pressable>
          </View>
        ))}
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
  delete: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  form: {
    gap: Spacing.two + 2,
  },
  dim: {
    opacity: 0.5,
  },
});
