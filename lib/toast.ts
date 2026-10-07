import { toast as sonnerToast } from "sonner";

/**
 * Toast notifications helper adhering to RUET ELMS Design Guide:
 * Tone: clear, respectful, short. (e.g. "Your submission was saved as version 2.")
 * Toasts are for background/success confirmation. Critical actionable errors stay inline.
 */
export const toast = {
  success: (message: string, description?: string) => {
    return sonnerToast.success(message, {
      description,
    });
  },
  info: (message: string, description?: string) => {
    return sonnerToast.info(message, {
      description,
    });
  },
  warning: (message: string, description?: string) => {
    return sonnerToast.warning(message, {
      description,
    });
  },
  error: (message: string, description?: string) => {
    return sonnerToast.error(message, {
      description,
    });
  },
};

export const showSuccessToast = (message: string, description?: string) =>
  toast.success(message, description);

export const showErrorToast = (message: string, description?: string) =>
  toast.error(message, description);
