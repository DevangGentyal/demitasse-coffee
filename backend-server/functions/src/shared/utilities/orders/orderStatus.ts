const STATUS_KEYS = ["status", "orderStatus", "orderLifecycleStatus", "currentStatus"] as const;

const readString = (value: unknown): string => String(value ?? "").trim();

export const resolveOrderStatus = (
  orderData: FirebaseFirestore.DocumentData | Record<string, unknown> | null | undefined,
): string => {
  if (!orderData) return "";
  for (const key of STATUS_KEYS) {
    const status = readString((orderData as Record<string, unknown>)[key]).toUpperCase();
    if (status) return status;
  }
  return "";
};

export const isOrderActive = (
  orderData: FirebaseFirestore.DocumentData | Record<string, unknown> | null | undefined,
  inactiveStatuses: string[] = ["CANCELLED", "COMPLETED", "CLOSED", "DELETED", "ARCHIVED"],
): boolean => !inactiveStatuses.includes(resolveOrderStatus(orderData));

export const isOrderCancelled = (orderData: FirebaseFirestore.DocumentData | Record<string, unknown> | null | undefined): boolean => {
  return resolveOrderStatus(orderData) === "CANCELLED";
};

export const isOrderArchived = (orderData: FirebaseFirestore.DocumentData | Record<string, unknown> | null | undefined): boolean => {
  return resolveOrderStatus(orderData) === "ARCHIVED";
};
