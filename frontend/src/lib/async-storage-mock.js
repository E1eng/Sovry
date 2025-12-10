// Minimal in-memory mock for @react-native-async-storage/async-storage.
// Used to satisfy React Native async storage imports in web/Next.js.

const store = new Map();

export async function getItem(key) {
  if (!store.has(key)) return null;
  return store.get(key);
}

export async function setItem(key, value) {
  store.set(key, value);
}

export async function removeItem(key) {
  store.delete(key);
}

export async function clear() {
  store.clear();
}

const asyncStorageMock = {
  getItem,
  setItem,
  removeItem,
  clear,
};

export default asyncStorageMock;
