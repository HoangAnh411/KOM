import { PROTOCOL_VERSION } from "@kingdoms/shared";

export function protocolBlockedMessage(snapshot: { protocolVersion?: number } | undefined): string | undefined {
  if (!snapshot) return undefined;
  if (snapshot.protocolVersion === undefined) return "Máy chủ chưa thông báo phiên bản giao thức — hãy tải lại trang.";
  if (snapshot.protocolVersion !== PROTOCOL_VERSION) return "Phiên bản game đã thay đổi — hãy tải lại trang để tiếp tục.";
  return undefined;
}