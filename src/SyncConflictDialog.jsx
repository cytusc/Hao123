import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigation } from "./navigation";

export default function SyncConflictDialog() {
  const { syncConflict, resolveSyncConflict } = useNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resolve = async (choice) => {
    setBusy(true);
    setError("");
    try {
      await resolveSyncConflict(choice);
    } catch (e) {
      setError(e.status === 409 ? "云端又有新修改，请重新选择。" : e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={syncConflict}>
      <DialogContent
        className="auth-dialog"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>其他设备更新了配置</DialogTitle>
          <DialogDescription>
            本机改动尚未上传。请选择要保留的配置，继续同步。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button
            disabled={busy}
            className="w-full"
            onClick={() => resolve("merge")}
          >
            合并两端配置
          </Button>
          <p className="text-xs text-muted-foreground">
            网站去重合并，隐藏优先；任一设备关闭个性化时保持关闭。显示与搜索设置采用本机。
          </p>
          <Button
            disabled={busy}
            variant="outline"
            className="w-full"
            onClick={() => resolve("cloud")}
          >
            采用云端（替换本机改动）
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            className="w-full"
            onClick={() => resolve("local")}
          >
            使用本机（覆盖云端配置）
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
