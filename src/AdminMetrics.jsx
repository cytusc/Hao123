import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const count = (n) => new Intl.NumberFormat("zh-CN").format(n);
const ratio = (n) => (n == null ? "无样本" : `${(n * 100).toFixed(1)}%`);
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        dateStyle: "short",
        timeStyle: "short",
        hour12: false,
      }).format(new Date(value))
    : "尚未执行";

export default function AdminMetrics({ refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api("/admin/metrics")
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, retry]);
  if (error)
    return (
      <div role="alert" className="admin-error">
        指标读取失败：{error}
        <Button variant="ghost" onClick={() => setRetry((v) => v + 1)}>
          重试
        </Button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="admin-help-text">
        正在读取指标…
      </p>
    );
  const {
    window: period,
    north_star: north,
    events_7d: events,
    rates,
    totals,
    quality,
  } = data;
  const attempts = events.prefs_save + events.prefs_conflict;
  const faults =
    quality.write_failures_process +
    quality.cleanup_failures_process +
    quality.request_failures_process;
  return (
    <div className="admin-metrics" aria-busy={loading}>
      <Card>
        <CardHeader>
          <CardTitle>有配置，也有回来使用</CardTitle>
          <CardDescription>
            近 7 天的可观测活跃 · {date(period.start)} 至 {date(period.end)}
            （北京时间）{loading ? " · 更新中…" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="metrics-activity">
            <div className="metrics-primary">
              <span className="admin-stat-value">
                {count(north.wau_personalized_observed)}
              </span>
              <strong>活跃且有个性化配置</strong>
              <span className="admin-help-text">
                当前有置顶或自定义网站，并有近期公共网站点击
              </span>
            </div>
            <dl>
              <div>
                <dt>可观测活跃账号</dt>
                <dd>{count(north.wau_observed)}</dd>
              </div>
              <div>
                <dt>当前有配置的账号</dt>
                <dd>{count(north.personalized_config_users)}</dd>
              </div>
              <div>
                <dt>启用的普通账号</dt>
                <dd>{count(totals.users)}</dd>
              </div>
            </dl>
          </div>
          <p className="admin-help-text mt-5">{quality.activity_scope}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>P0 使用与故障</CardTitle>
          <CardDescription>
            比率与样本数一起读；没有样本时不显示为 0%。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>指标</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>样本与含义</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>配置冲突率</TableCell>
                <TableCell>{ratio(rates.conflict_rate)}</TableCell>
                <TableCell>
                  {count(events.prefs_conflict)} 次冲突 / {count(attempts)}{" "}
                  次保存尝试；冲突表示已阻止覆盖
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>找回事件比</TableCell>
                <TableCell>{ratio(rates.recovery_event_ratio)}</TableCell>
                <TableCell>
                  {count(events.reset_success)} 次重置 /{" "}
                  {count(events.forgot_request_eligible)}{" "}
                  次有效账号请求；重复与跨期请求使其不等于转化率
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>邮箱验证率</TableCell>
                <TableCell>{ratio(rates.verified_rate)}</TableCell>
                <TableCell>
                  {count(totals.verified_users)} / {count(totals.users)}{" "}
                  个启用普通账号；含重置时验证
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>找回发信</TableCell>
                <TableCell>{count(events.forgot_mail_accepted)} 次</TableCell>
                <TableCell>
                  邮件服务接受次数，不代表最终进入收件箱；共{" "}
                  {count(events.forgot_request)} 次请求
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>注册 / 登录</TableCell>
                <TableCell>
                  {count(events.register)} / {count(events.login)}
                </TableCell>
                <TableCell>
                  成功事件数，排除管理员；登录次数不等于人数
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>标签删除 / 清空</TableCell>
                <TableCell>
                  {count(events.tag_delete)} / {count(events.tag_clear)}
                </TableCell>
                <TableCell>成功操作次数，不代表实际删除数量</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>每日操作基线</CardTitle>
          <CardDescription>
            最近 14 个自然日，按北京时间分组；与上方滚动 7 天窗口不同。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.daily.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "日期",
                    "注册",
                    "保存成功",
                    "保存冲突",
                    "找回请求",
                    "重置成功",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.daily.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell>{row.day}</TableCell>
                    {[
                      "register",
                      "prefs_save",
                      "prefs_conflict",
                      "forgot_request",
                      "reset_success",
                    ].map((kind) => (
                      <TableCell key={kind}>
                        {count(row.events[kind] || 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="admin-help-text">
              尚无操作数据。普通用户完成注册、同步或找回后，这里会开始积累基线。
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>采集与保留状态</CardTitle>
          <CardDescription>
            采集开始：{date(quality.collection_started_at)}；指标定义版本{" "}
            {quality.definition_version}。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(faults > 0 || quality.cleanup_overdue) && (
            <p role="alert" className="admin-error">
              {quality.cleanup_overdue
                ? "保留清理尚未执行或已超时，请检查 API 服务日志。"
                : "检测到采集或业务故障，请核对服务日志后解读指标。"}
            </p>
          )}
          <p className="admin-help-text">
            本进程累计：事件漏记 {count(quality.write_failures_process)}{" "}
            次，清理失败 {count(quality.cleanup_failures_process)} 次，接口故障{" "}
            {count(quality.request_failures_process)} 次，其中同步故障{" "}
            {count(quality.sync_failures_process)}{" "}
            次。重启会归零，多实例各自计数。
          </p>
          <p className="admin-help-text">
            明细保留 {quality.retention_days}{" "}
            天，每日清理并归档为不含用户标识的操作计数。最近清理：
            {date(quality.last_cleanup_at)}。
          </p>
          <p className="admin-help-text">
            事件尽力写入，进程意外退出可能漏记；不用于审计。账户与同步操作不收集邮箱、网络标识、网址或兴趣内容，也不记录逐条点击。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
