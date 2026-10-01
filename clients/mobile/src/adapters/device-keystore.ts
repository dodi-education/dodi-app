import { fromBase64Url, toBase64Url } from "@dodi/crypto";
import type { DeviceKeystore, StoredDevice } from "@dodi/vault";

import { sealedSlot } from "./sealed-storage";

/** The device's identity (id + ML-KEM + ML-DSA keys), sealed on the device. */
export function createDeviceKeystore(): DeviceKeystore {
  const slot = sealedSlot("device");
  return {
    async load() {
      const raw = await slot.read();
      if (!raw) return null;
      const d = JSON.parse(raw) as Record<string, string>;
      return {
        deviceId: d.deviceId,
        kem: { publicKey: fromBase64Url(d.kemPublic), secretKey: fromBase64Url(d.kemSecret) },
        sign: { publicKey: fromBase64Url(d.signPublic), secretKey: fromBase64Url(d.signSecret) },
      } satisfies StoredDevice;
    },
    async save(device) {
      await slot.write(
        JSON.stringify({
          deviceId: device.deviceId,
          kemPublic: toBase64Url(device.kem.publicKey),
          kemSecret: toBase64Url(device.kem.secretKey),
          signPublic: toBase64Url(device.sign.publicKey),
          signSecret: toBase64Url(device.sign.secretKey),
        }),
      );
    },
    clear: () => slot.clear(),
  };
}
