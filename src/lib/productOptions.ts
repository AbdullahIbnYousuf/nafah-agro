export function visiblePackSize(name: string | null | undefined): string | null {
  const normalized = name?.trim();
  if (!normalized || normalized.toLowerCase() === 'default') return null;
  return normalized;
}

export function packSizeAdminLabel(name: string | null | undefined): string {
  return visiblePackSize(name) ?? 'প্যাক/সাইজ দেওয়া হয়নি';
}

export function packSizeCustomerLabel(name: string | null | undefined): string {
  return visiblePackSize(name) ?? 'সাধারণ';
}

export function productPackLabel(productName: string, packSizeName: string | null | undefined): string {
  const packSize = visiblePackSize(packSizeName);
  return packSize ? `${productName} · ${packSize}` : productName;
}
