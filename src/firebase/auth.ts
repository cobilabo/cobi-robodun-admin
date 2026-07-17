import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from './config';

export function onAuthStateChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

export async function login(email: string, password: string) {
  await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
}

export async function logout() {
  await signOut(getFirebaseAuth());
}

export type { User };
