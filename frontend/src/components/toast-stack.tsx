import {
  Notification,
  NotificationViewport,
  type NotificationStatus,
} from "@/components/base/notification/notification";

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  status: NotificationStatus;
}

export default function ToastStack({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <NotificationViewport position="bottom-right">
      {items.map((toast) => (
        <Notification
          key={toast.id}
          title={toast.title}
          description={toast.description}
          status={toast.status}
          autoDismissDuration={5000}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </NotificationViewport>
  );
}
