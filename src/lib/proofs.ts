import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

/**
 * Proof photos are copied into the document directory and stored by file name only,
 * because the absolute container path can change between app updates on iOS.
 */
const FOLDER = 'proofs';

export function proofUri(file: string) {
  if (Platform.OS === 'web') return file;
  return new File(Paths.document, FOLDER, file).uri;
}

export function deleteProof(file: string) {
  if (Platform.OS === 'web') return;
  try {
    new File(Paths.document, FOLDER, file).delete();
  } catch {
    // Already gone.
  }
}

async function persist(uri: string, name: string) {
  if (Platform.OS === 'web') return uri;
  const dir = new Directory(Paths.document, FOLDER);
  dir.create({ idempotent: true, intermediates: true });
  const target = new File(dir, name);
  if (target.exists) target.delete();
  await new File(uri).copy(target);
  return name;
}

async function pick(source: 'camera' | 'library') {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.6 };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access is off', 'Allow camera access in Settings to snap proof photos.');
      return null;
    }
    return ImagePicker.launchCameraAsync(options);
  }
  return ImagePicker.launchImageLibraryAsync(options);
}

/** Asks camera-or-library, then saves the photo. Resolves to the stored file name, or null. */
export function captureProof(habitId: string, day: string): Promise<string | null> {
  const run = async (source: 'camera' | 'library'): Promise<string | null> => {
    try {
      const result = await pick(source);
      if (!result || result.canceled || !result.assets?.[0]) return null;
      return await persist(result.assets[0].uri, `${habitId}-${day}-${Date.now()}.jpg`);
    } catch {
      // The simulator has no camera; fall back to the library.
      return source === 'camera' ? run('library') : null;
    }
  };
  if (Platform.OS === 'web') return run('library');
  return new Promise((resolve) =>
    Alert.alert('Add proof', 'Snap a photo of what you did.', [
      { text: 'Take photo', onPress: () => run('camera').then(resolve) },
      { text: 'Choose from library', onPress: () => run('library').then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ])
  );
}
