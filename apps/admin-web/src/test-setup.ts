/**
 * Cấu hình chung cho test giao diện (vitest `setupFiles`).
 *
 * `findBy*`/`waitFor` mặc định chỉ chờ 1 giây. Thông báo validate và dropdown của antd hiện sau một
 * nhịp render; trên runner CI chậm nhịp đó vượt 1 giây (ClaimPage, UsersPage). Chờ tới 5 giây không
 * làm chậm test đạt — `findBy*` trả về ngay khi phần tử xuất hiện.
 */

import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5000 });
