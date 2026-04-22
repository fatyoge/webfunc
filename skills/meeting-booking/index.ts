export default {
  async beforeRun(context: any) {
    const p = context.params;
    const page = context.page;

    if (!page) {
      throw new Error(
        '需要在 browser 模式下运行以复用浏览器 session。请确认已连接浏览器（webfunc run -p <profile> 或默认 CDP）。'
      );
    }

    // 默认值
    const today = new Date().toISOString().slice(0, 10);
    p.date = p.date || today;
    p.startTime = p.startTime || '10:00';
    p.floor = p.floor || '200';
    p.excludeRoom = p.excludeRoom || '2001';
    p.subject = p.subject || '工作会议';
    p.bookingBy = p.bookingBy || 'ouruibin';

    // 默认 endTime = startTime + 1小时
    if (!p.endTime) {
      const [sh, sm] = String(p.startTime).split(':').map(Number);
      const eh = (sh + 1) % 24;
      p.endTime = `${String(eh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    }

    // 计算时长（分钟）
    const [sh, sm] = String(p.startTime).split(':').map(Number);
    const [eh, em] = String(p.endTime).split(':').map(Number);
    p.duration = String((eh * 60 + em) - (sh * 60 + sm));

    // 完整日期时间
    p.startDateTime = `${p.date} ${p.startTime}:00`;
    p.endDateTime = `${p.date} ${p.endTime}:00`;

    // 在浏览器内执行 fetch，复用浏览器 session（cookies + 自动探测 token）
    const searchResult = await page.evaluate(async (args) => {
      if (typeof globalThis.__name === 'undefined') {
        (globalThis as any).__name = (o: any) => o;
      }
      const url = new URL(
        'http://ioa.gf.com.cn/meetingApi/meeting/area/selectMeetingRoomList'
      );
      url.searchParams.set('keyword', args.floor);
      url.searchParams.set('pageNum', '1');
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('type', '3');
      url.searchParams.set('meetingDate', args.date);
      url.searchParams.set('startTime', args.startDateTime);
      url.searchParams.set('endTime', args.endDateTime);
      url.searchParams.set('supportPeriod', 'false');
      url.searchParams.set('supportCisco', 'false');

      const doFetch = async (token?: string) => {
        const headers: Record<string, string> = {
          accept: 'application/json, text/plain, */*',
        };
        if (token) headers['meeting-token'] = token;
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers,
          credentials: 'include',
        });
        const data = await res.json();
        return { status: res.status, data };
      };

      // 第一次：依赖浏览器 cookies
      let result = await doFetch();

      // 如果 401，尝试从 localStorage / sessionStorage 获取 token 重试
      if (result.status === 401 || result.data?.code === 401) {
        const keys = [
          'meeting-token',
          'token',
          'accessToken',
          'authToken',
          'jwt',
        ];
        for (const key of keys) {
          const val =
            localStorage.getItem(key) || sessionStorage.getItem(key);
          if (val && val.length > 20) {
            const bearer = val.startsWith('Bearer ') ? val : `Bearer ${val}`;
            result = await doFetch(bearer);
            if (result.status === 200 && result.data?.code !== 401) {
              return { ...result, token: bearer };
            }
          }
        }
      }

      return result;
    }, {
      floor: p.floor,
      date: p.date,
      startDateTime: p.startDateTime,
      endDateTime: p.endDateTime,
    });

    // 保存探测到的 token 供后续步骤使用
    if (searchResult.token) {
      p.meetingToken = searchResult.token;
    }

    if (
      searchResult.status !== 200 ||
      searchResult.data?.code === 401 ||
      searchResult.data?.code === 403
    ) {
      throw new Error(
        `会议室查询失败: ${searchResult.data?.msg || `HTTP ${searchResult.status}`}。请确认浏览器已登录会议室系统。`
      );
    }

    const data = searchResult.data;
    let rooms: any[] = [];

    if (data?.rows && Array.isArray(data.rows)) {
      rooms = data.rows;
    } else if (data?.data?.rows && Array.isArray(data.data.rows)) {
      rooms = data.data.rows;
    } else if (Array.isArray(data?.data)) {
      rooms = data.data;
    } else if (Array.isArray(data)) {
      rooms = data;
    }

    const available = rooms.filter((room: any) => {
      const name = String(
        room.name || room.roomName || room.roomNo || room.meetingRoomName || ''
      );
      if (name === p.excludeRoom) return false;

      const status =
        room.status !== undefined ? String(room.status) : undefined;
      if (
        status !== undefined &&
        status !== '0' &&
        status !== '1' &&
        status !== 'free' &&
        status !== 'available'
      ) {
        return false;
      }

      return true;
    });

    if (available.length === 0) {
      throw new Error(
        `未找到可用会议室（楼层: ${p.floor}, 排除: ${p.excludeRoom}, 时间: ${p.date} ${p.startTime}-${p.endTime}）`
      );
    }

    const selected = available[0];
    p.roomId = String(selected.id ?? selected.roomId);
    p.roomName =
      selected.name ||
      selected.roomName ||
      selected.roomNo ||
      selected.meetingRoomName ||
      '未知';

    console.log(
      `[meeting-booking] 选中会议室: ${p.roomName} (ID: ${p.roomId})`
    );
  },

  async executeStep(step: any, context: any) {
    const page = context.page;
    if (!page) {
      throw new Error('需要 browser 模式');
    }
    const p = context.params;
    const token = p.meetingToken || '';

    if (step.id === 'book_meeting') {
      const body: Record<string, unknown> = {
        type: ['NORMAL'],
        meetingDate: p.date,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: Number(p.duration),
        roomId: Number(p.roomId),
        doubleFlowFlag: true,
        muteFlag: false,
        videoFlag: false,
        videoNumber: null,
        phoneNumber: null,
        periodType: '1',
        dayOfMonth: null,
        dayOfWeek: '',
        periodEndDate: '',
        subject: p.subject,
        bookingBy: p.bookingBy,
        content: null,
        coremailNotice: true,
        wechatNotice: true,
        noticeBookingUser: true,
        noticeJoinUser: true,
        successNotice: false,
        advanceNotice: false,
        iworkNotice: false,
        advanceNoticeTime: null,
        applyReason: null,
        jiraUrl: '',
        meetingTencentSetting: {
          enablePassword: false,
          meetingPassword: '',
          enableWaitingRoom: false,
          allowEnterBeforeHost: true,
          remindScope: '2',
          enableEnterMute: '2',
          allowExternalUser: true,
          enableScreenWatermark: false,
          ringUsers: [],
        },
        listenUserId: '',
        periodCode: null,
        recordEnable: null,
        meetingPeriod: {
          startDate: null,
          frequencyInterval: 1,
        },
        startDate: null,
        listenRoomId: null,
        frequencyInterval: 1,
      };

      const result = await page.evaluate(async (args) => {
        if (typeof globalThis.__name === 'undefined') {
          (globalThis as any).__name = (o: any) => o;
        }
        const headers: Record<string, string> = {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json;charset=UTF-8',
        };
        if (args.token) headers['meeting-token'] = args.token;

        const res = await fetch(args.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(args.body),
          credentials: 'include',
        });
        const data = await res.json();
        return { status: res.status, data };
      }, { url: step.url, token, body });

      return { status: result.status, data: result.data };
    }

    // 其他步骤：通用 browser fetch
    const result = await page.evaluate(async (args) => {
      if (typeof globalThis.__name === 'undefined') {
        (globalThis as any).__name = (o: any) => o;
      }
      const headers: Record<string, string> = { ...(args.headers || {}) };
      if (args.token) headers['meeting-token'] = args.token;

      const options: RequestInit = {
        method: args.method,
        headers,
        credentials: 'include',
      };
      if (args.body && args.method !== 'GET') {
        options.body =
          typeof args.body === 'string'
            ? args.body
            : JSON.stringify(args.body);
      }
      const res = await fetch(args.url, options);
      const text = await res.text();
      let data: any = text;
      try {
        data = JSON.parse(text);
      } catch {
        // keep as text
      }
      return { status: res.status, data };
    }, {
      method: step.method,
      url: step.url,
      headers: step.headers,
      body: step.body,
      token,
    });

    return { status: result.status, data: result.data };
  },

  async postProcess(result: any, context: any) {
    const p = context.params || {};
    if (result.success) {
      result.summary = `会议室预订成功: ${p.roomName} | ${p.date} ${p.startTime}-${p.endTime} | 主题: ${p.subject}`;
    }
    return result;
  },
};
