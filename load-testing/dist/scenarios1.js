import http from "k6/http";
import { sleep } from "k6";
export const options = {
  // シナリオ設定
  scenarios: {
    "scenarios": {
      executor: "shared-iterations",
      // 複数のVUでiterationを共有
      vus: 2,
      // 同時接続数
      iterations: 2,
      // シナリオの総反復回数
      maxDuration: "30s"
      // 試験の実行時間
    }
  },
  // テスト対象システムの期待性能の合格・不合格を判断する閾値
  thresholds: {
    http_req_failed: ["rate<0.01"],
    // エラーが1%を超えない
    http_req_duration: ["p(95)<200"]
    // リクエストの95%は200ms以下であること
  }
};
export default function() {
  const res = http.get("https://test.k6.io");
  sleep(0.5);
}
