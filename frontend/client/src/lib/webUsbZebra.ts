/** Zebra Technologies USB vendor id (common across many Zebra printers). */
const ZEBRA_VENDOR_ID = 0x0a5f;

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

export interface ZebraUsbSession {
  device: USBDevice;
  printZpl(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/**
 * Pair with a Zebra printer (user gesture required for requestDevice).
 */
export async function connectZebraZD220Like(): Promise<ZebraUsbSession> {
  const device = await navigator.usb.requestDevice({
    filters: [{ vendorId: ZEBRA_VENDOR_ID }],
  });
  await device.open();
  if (device.configuration === null) {
    if (device.configurations.length === 0) {
      throw new Error("Nenhuma configuração USB no dispositivo");
    }
    await device.selectConfiguration(1);
  } else {
    await device.selectConfiguration(device.configuration.configurationValue);
  }
  const ifn = 0;
  await device.claimInterface(ifn);

  const outEp = findBulkOutEndpointNumber(device, ifn);
  if (outEp == null) {
    try {
      await device.close();
    } catch {
      // ignore
    }
    throw new Error("Endpoint de saída (bulk) não encontrado no dispositivo");
  }

  return {
    device,
    async printZpl(data: Uint8Array) {
      await device.transferOut(outEp, data);
    },
    async close() {
      try {
        await device.close();
      } catch {
        // ignore
      }
    },
  };
}

function findBulkOutEndpointNumber(device: USBDevice, iface: number): number | null {
  const conf = device.configuration;
  if (!conf) {
    return null;
  }
  for (const i of conf.interfaces) {
    if (i.interfaceNumber !== iface) {
      continue;
    }
    const alt = i.alternates[0];
    for (const ep of alt.endpoints) {
      if (ep.type === "bulk" && ep.direction === "out") {
        return ep.endpointNumber;
      }
    }
  }
  return null;
}
