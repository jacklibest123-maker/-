const { useState, useEffect, useCallback } = React;

// 飞书凭证配置
const FEISHU_CREDENTIALS = {
  appId: 'cli_a950a4a93d799cc3',
  appSecret: 'OZ3KxVm1emeYwaAahC0kSt45YtbatdCg'
};

// 飞书表格配置
const FEISHU_CONFIG = {
  inquiry: {
    appToken: 'OPM1baMWWaLPCgslVWTcqyT4n4b',
    tableId: 'tbl1cyGBpPofWbRr',
    name: '采购询价库-前期',
    displayName: '采购询价库-前期',
    approvalUrl: 'https://applink.feishu.cn/approval/pr/14E31F62-C4E2-4A61-A669-3AAA9E74AF98',
    // 字段映射
    fields: {
      primaryName: '需求人名称',       // 主字段（文本）
      primaryValue: null,              // 动态填充
      status: '状态',                  // 单选：待报价/询价中/已报价/已完成
      dept: '所在部门',
      product: '产品明细',
      qty: '产品数量',
      amount: '金额（采购填写）',
      inquiryNo: '询价单号'
    }
  },
  budget: {
    appToken: 'K9QObvioLaVI8wsOMcVcfgqInTf',
    tableId: 'tblwGI5zEZgTUo4i',
    name: '采购预算申请库',
    displayName: '采购预算申请库',
    approvalUrl: 'https://applink.feishu.cn/approval/pr/66533005-BB19-4C88-918A-F74594E9AC2A',
    fields: {
      primaryName: '需求人名称',
      primaryValue: null,
      status: '状态',                  // 单选：待提交/审批中/已通过/已驳回
      dept: '所在部门',
      product: '产品信息',
      qty: '数量',
      amount: '预计金额',
      inquiryNo: '关联询价前期单号'
    }
  },
  purchase: {
    appToken: 'NPZgb0ClFaEXJCsojxBcyah5ndd',
    tableId: 'tbl9cjiTQhr8woXS',
    name: '采购申请库',
    displayName: '采购申请库',
    approvalUrl: 'https://applink.feishu.cn/approval/pr/E42DBEDC-E4E7-4CA6-A8AF-53B4547F9EA6',
    fields: {
      primaryName: '关联预算单号',
      primaryValue: null,
      status: '状态',                  // 单选：待处理/询价中/比价中/已完成
      name: '需求人',
      dept: '部门',
      product: '产品明细',
      qty: '数量',
      remark: '备注说明'
    }
  },
  comparison: {
    appToken: 'ORcCbXVj6adZQRsUqyocghKUned',
    tableId: 'tblyKuHJawu9jXKU',
    name: '采购比价结果库',
    displayName: '采购比价结果库',
    approvalUrl: 'https://applink.feishu.cn/approval/pr/604F6ECF-41ED-4E16-9585-55749A85AC1A',
    fields: {
      primaryName: '关联采购申请单号',
      primaryValue: null,
      status: '状态',                  // 单选：待审批/审批中/已通过/已驳回
      supplierA: '供应商A报价',
      supplierB: '供应商B报价',
      supplierC: '供应商C报价',
      recommend: '推荐供应商',
      opinion: '选择意见'
    }
  },
  contract: {
    appToken: 'UZscbYdHRakUMVsFfswcE2Manac',
    tableId: 'tblaYH8SXBTWq6Ja',
    name: '采购合同库',
    displayName: '采购合同库',
    approvalUrl: 'https://applink.feishu.cn/approval/pr/9B9F4BCC-9296-4C0D-9120-3AC5B05BAFBB',
    fields: {
      primaryName: '关联比价单号',
      primaryValue: null,
      status: '状态',                  // 单选：待审批/审批中/已通过/已归档
      amount: '合同金额',
      supplier: '供应商名称',
      payment: '付款方式',
      delivery: '交付时间'
    }
  }
};

// 飞书 API 调用模块
const feishuApi = {
  _tokenCache: null,
  _tokenExpiry: 0,

  // 获取 tenant_access_token（带缓存）
  async getAccessToken() {
    if (this._tokenCache && Date.now() < this._tokenExpiry) {
      return this._tokenCache;
    }
    try {
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: FEISHU_CREDENTIALS.appId,
          app_secret: FEISHU_CREDENTIALS.appSecret
        })
      });
      const data = await response.json();
      if (data.code !== 0) {
        throw new Error(`获取token失败: ${data.msg}`);
      }
      this._tokenCache = data.tenant_access_token;
      // 提前5分钟过期
      this._tokenExpiry = Date.now() + (data.expire - 300) * 1000;
      return this._tokenCache;
    } catch (err) {
      console.error('获取access_token失败:', err);
      throw err;
    }
  },

  // 查询记录（支持按字段筛选）
  async queryRecords(config, filterField, filterValue) {
    try {
      const token = await this.getAccessToken();
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`查询记录失败: ${data.msg}`);
      }

      // 在前端过滤（API不支持字段筛选的复杂查询，这里取回前100条再过滤）
      const records = data.data.items || [];
      const matched = records.find(record => {
        const fields = record.fields || {};
        const fieldValue = fields[filterField];
        if (typeof fieldValue === 'string') return fieldValue === filterValue;
        if (fieldValue && typeof fieldValue === 'object') return fieldValue.text === filterValue;
        return false;
      });

      return {
        exists: !!matched,
        record: matched || null,
        status: matched ? (matched.fields[config.fields.status] || null) : null
      };
    } catch (err) {
      console.error('queryRecords错误:', err);
      throw err;
    }
  },

  // 新增记录
  async addRecord(config, fieldsData) {
    try {
      const token = await this.getAccessToken();
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: fieldsData })
      });
      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`新增记录失败: ${data.msg}`);
      }
      return { success: true, record: data.data };
    } catch (err) {
      console.error('addRecord错误:', err);
      throw err;
    }
  },

  // 通用状态查询（根据不同模块调用）
  async queryStatus(module, fieldValue) {
    const moduleMap = {
      inquiry: { config: FEISHU_CONFIG.inquiry, filterField: FEISHU_CONFIG.inquiry.fields.inquiryNo },
      budget: { config: FEISHU_CONFIG.budget, filterField: FEISHU_CONFIG.budget.fields.inquiryNo },
      purchase: { config: FEISHU_CONFIG.purchase, filterField: FEISHU_CONFIG.purchase.fields.primaryName },
      comparison: { config: FEISHU_CONFIG.comparison, filterField: FEISHU_CONFIG.comparison.fields.primaryName }
    };
    const mapping = moduleMap[module];
    if (!mapping) return { exists: false, status: null };
    return this.queryRecords(mapping.config, mapping.filterField, fieldValue);
  }
};

// 格式化学号（生成 QJD2024001 这种格式）
function generateDocNo(prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const random = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `${prefix}${year}${random}`;
}

// 获取状态值选项（飞书多维表格单选字段的选项名）
// 以下状态值需要与多维表格中实际配置的选项名一致
const STATUS_OPTIONS = {
  inquiry: '待报价',      // 询价前期-状态
  budget_draft: '待提交',  // 预算申请-状态
  budget_passed: '已通过', // 预算申请-状态（审批通过后）
  purchase: '待处理',     // 采购申请-状态
  comparison: '待审批',   // 比价汇报-状态
  contract: '待审批'      // 合同审批-状态
};

// Toast组件
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };
  
  return (
    <div className={`fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg toast z-50`}>
      {message}
    </div>
  );
}

// Tab按钮
function TabButton({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 text-sm font-medium transition-all duration-200 ${
        active ? 'tab-active' : 'tab-inactive'
      }`}
    >
      {label}
    </button>
  );
}

// 前置条件提示栏
function PrerequisiteAlert({ items }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-sm font-medium text-blue-800">⚠️ 前置条件</p>
          <ul className="mt-2 text-sm text-blue-700 space-y-1">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// 提交成功数据面板（方案1）
function SubmitDataPanel({ title, dataText, approvalUrl, onReset, showToast }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(dataText);
      setCopied(true);
      showToast('数据已复制到剪贴板', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = dataText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      showToast('数据已复制到剪贴板', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  const handleOpenApproval = () => {
    window.open(approvalUrl, '_blank');
  };
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <p className="text-sm text-gray-500">✅ 数据已写入飞书多维表格，可点击下方按钮跳转审批</p>
        </div>
      </div>
      
      {/* 数据卡片 */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">可复制数据</span>
          <span className="text-xs text-slate-400">点击复制按钮复制全部内容</span>
        </div>
        <pre className="font-mono text-sm text-slate-700 whitespace-pre-wrap leading-relaxed overflow-x-auto">
          {dataText}
        </pre>
      </div>
      
      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleCopy}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
            copied 
              ? 'bg-green-500 text-white' 
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              已复制
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              复制数据
            </>
          )}
        </button>
        
        <button
          onClick={handleOpenApproval}
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2"
        >
          去飞书审批 →
        </button>
        
        <button
          onClick={onReset}
          className="text-gray-500 hover:text-gray-700 text-sm font-medium px-4 py-2.5 ml-auto"
        >
          继续填写新表单
        </button>
      </div>
    </div>
  );
}

// 错误提示组件
function ValidationError({ message }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
      <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      <p className="text-sm text-red-700 font-medium">{message}</p>
    </div>
  );
}

// 表单输入组件
function FormInput({ label, name, value, onChange, required, placeholder, type = 'text', error }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`form-input w-full px-4 py-2.5 border rounded-lg text-sm transition-all duration-200 outline-none ${
          error ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// 下拉选择组件
function FormSelect({ label, name, value, onChange, required, options, placeholder }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="form-input w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm transition-all duration-200 outline-none focus:border-blue-500 bg-white"
      >
        <option value="">{placeholder || '请选择'}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// 文本域组件
function FormTextarea({ label, name, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="form-input w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm resize-none outline-none transition-all duration-200"
      />
    </div>
  );
}

// 询价前期Tab
function InquiryTab({ showToast }) {
  const [form, setForm] = useState({ name: '', dept: '', product: '', qty: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dataText, setDataText] = useState('');
  
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.dept || !form.product || !form.qty) {
      showToast('请填写所有必填字段', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const fieldsData = {
        [FEISHU_CONFIG.inquiry.fields.primaryName]: form.name,
        [FEISHU_CONFIG.inquiry.fields.dept]: form.dept,
        [FEISHU_CONFIG.inquiry.fields.product]: form.product,
        [FEISHU_CONFIG.inquiry.fields.qty]: Number(form.qty),
        [FEISHU_CONFIG.inquiry.fields.status]: STATUS_OPTIONS.inquiry,
        [FEISHU_CONFIG.inquiry.fields.amount]: null  // 采购填写，初始为空
      };
      
      const result = await feishuApi.addRecord(FEISHU_CONFIG.inquiry, fieldsData);
      
      const text = `【询价前期-已提交】
需求人：${form.name}
部门：${form.dept}
产品明细：${form.product}
产品数量：${form.qty}
状态：待报价
记录ID：${result.record ? result.record.record_id : '未知'}`;
      
      setDataText(text);
      setSubmitted(true);
      showToast('✅ 已成功写入飞书表格', 'success');
    } catch (err) {
      showToast('写入失败: ' + err.message, 'error');
    }
    setLoading(false);
  };
  
  const handleReset = () => {
    setForm({ name: '', dept: '', product: '', qty: '' });
    setSubmitted(false);
    setDataText('');
  };
  
  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">采购询价前期</h2>
        <p className="text-sm text-gray-500 mt-1">填写采购询价申请，用于预算依据（不保证落地采购）</p>
      </div>
      
      {!submitted ? (
        <div className="bg-white rounded-xl card-shadow p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <PrerequisiteAlert items={['任何员工均可发起', '用于预算依据，不保证落地采购', '采购人员后续填写金额']} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput label="需求人名称" name="name" value={form.name} onChange={handleChange} required placeholder="请输入需求人姓名" />
              <FormInput label="所在部门" name="dept" value={form.dept} onChange={handleChange} required placeholder="请输入所在部门" />
              <FormInput label="产品明细" name="product" value={form.product} onChange={handleChange} required placeholder="请输入产品名称/型号" />
              <FormInput label="产品数量" name="qty" type="number" value={form.qty} onChange={handleChange} required placeholder="请输入数量" />
            </div>
            
            <div className="mt-6">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary text-white px-8 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
              >
                {loading ? '准备中...' : '提交申请'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <SubmitDataPanel 
          title="✅ 询价前期数据已准备好"
          dataText={dataText}
          approvalUrl={FEISHU_CONFIG.inquiry.approvalUrl}
          onReset={handleReset}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// 预算申请Tab
function BudgetTab({ showToast }) {
  const [form, setForm] = useState({ name: '', dept: '', product: '', qty: '', amount: '', inquiryNo: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [dataText, setDataText] = useState('');
  
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setValidationError('');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    
    if (!form.name || !form.dept || !form.product || !form.qty || !form.amount || !form.inquiryNo) {
      showToast('请填写所有必填字段', 'error');
      return;
    }
    
    // 校验关联的询价前期单号
    setLoading(true);
    try {
      const result = await feishuApi.queryStatus('inquiry', form.inquiryNo);
      
      if (!result.exists) {
        setValidationError('❌ 关联的询价前期单号不存在，请先在「询价前期」提交');
        setLoading(false);
        return;
      }
      
      if (result.status !== '已完成' && result.status !== '已报价') {
        setValidationError('❌ 关联的询价前期单尚未完成询价，请先完成询价流程');
        setLoading(false);
        return;
      }
      
      // 直接写入预算申请表格
      const fieldsData = {
        [FEISHU_CONFIG.budget.fields.inquiryNo]: form.inquiryNo,
        [FEISHU_CONFIG.budget.fields.primaryName]: form.name,
        [FEISHU_CONFIG.budget.fields.dept]: form.dept,
        [FEISHU_CONFIG.budget.fields.product]: form.product,
        [FEISHU_CONFIG.budget.fields.qty]: Number(form.qty),
        [FEISHU_CONFIG.budget.fields.amount]: Number(form.amount),
        [FEISHU_CONFIG.budget.fields.status]: STATUS_OPTIONS.budget_draft
      };
      
      const writeResult = await feishuApi.addRecord(FEISHU_CONFIG.budget, fieldsData);
      
      const text = `【预算申请-已提交】
需求人：${form.name}
部门：${form.dept}
产品信息：${form.product}
数量：${form.qty}
预计金额：${Number(form.amount).toLocaleString()}元
关联询价前期单号：${form.inquiryNo}
状态：待提交
记录ID：${writeResult.record ? writeResult.record.record_id : '未知'}`;
      
      setDataText(text);
      setSubmitted(true);
      showToast('✅ 已成功写入飞书表格', 'success');
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
    setLoading(false);
  };
  
  const handleReset = () => {
    setForm({ name: '', dept: '', product: '', qty: '', amount: '', inquiryNo: '' });
    setSubmitted(false);
    setValidationError('');
    setDataText('');
  };
  
  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">预算申请</h2>
        <p className="text-sm text-gray-500 mt-1">关联已完成的询价前期单，提交预算申请</p>
      </div>
      
      {!submitted ? (
        <div className="bg-white rounded-xl card-shadow p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <PrerequisiteAlert items={['必须关联已完成的「采购询价-前期」单号', '单号格式应以 QJD 开头', '用于预算审批依据']} />
            
            {validationError && <ValidationError message={validationError} />}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <FormInput 
                  label="关联询价前期单号" 
                  name="inquiryNo" 
                  value={form.inquiryNo} 
                  onChange={handleChange} 
                  required 
                  placeholder="如：QJD2024001（以QJD开头）"
                />
              </div>
              
              <FormInput label="需求人名称" name="name" value={form.name} onChange={handleChange} required placeholder="请输入需求人姓名" />
              <FormInput label="所在部门" name="dept" value={form.dept} onChange={handleChange} required placeholder="请输入所在部门" />
              <FormInput label="产品信息" name="product" value={form.product} onChange={handleChange} required placeholder="请输入产品名称/型号" />
              <FormInput label="数量" name="qty" type="number" value={form.qty} onChange={handleChange} required placeholder="请输入数量" />
              <FormInput label="预计金额（元）" name="amount" type="number" value={form.amount} onChange={handleChange} required placeholder="请输入预计金额" />
            </div>
            
            <div className="mt-6">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary text-white px-8 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
              >
                {loading ? '校验中...' : '提交预算申请'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <SubmitDataPanel 
          title="✅ 预算申请数据已准备好"
          dataText={dataText}
          approvalUrl={FEISHU_CONFIG.budget.approvalUrl}
          onReset={handleReset}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// 采购申请Tab
function PurchaseTab({ showToast }) {
  const [form, setForm] = useState({ budgetNo: '', name: '', dept: '', product: '', qty: '', remark: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [dataText, setDataText] = useState('');
  
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setValidationError('');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    
    if (!form.budgetNo || !form.name || !form.dept || !form.product || !form.qty) {
      showToast('请填写所有必填字段', 'error');
      return;
    }
    
    // 校验关联预算单号
    setLoading(true);
    try {
      const result = await feishuApi.queryStatus('budget', form.budgetNo);
      
      if (!result.exists) {
        setValidationError('❌ 该预算单号不存在，请先提交预算申请');
        setLoading(false);
        return;
      }
      
      if (result.status !== '已通过') {
        setValidationError('❌ 该预算单尚未审批通过，请先完成预算审批流程');
        setLoading(false);
        return;
      }
      
      // 直接写入采购申请表格
      const fieldsData = {
        [FEISHU_CONFIG.purchase.fields.primaryName]: form.budgetNo,
        [FEISHU_CONFIG.purchase.fields.name]: form.name,
        [FEISHU_CONFIG.purchase.fields.dept]: form.dept,
        [FEISHU_CONFIG.purchase.fields.product]: form.product,
        [FEISHU_CONFIG.purchase.fields.qty]: Number(form.qty),
        [FEISHU_CONFIG.purchase.fields.remark]: form.remark || '',
        [FEISHU_CONFIG.purchase.fields.status]: STATUS_OPTIONS.purchase
      };
      
      const writeResult = await feishuApi.addRecord(FEISHU_CONFIG.purchase, fieldsData);
      
      const text = `【采购申请-已提交】
关联预算单号：${form.budgetNo}
需求人：${form.name}
部门：${form.dept}
产品明细：${form.product}
数量：${form.qty}
备注：${form.remark || '无'}
状态：待处理
记录ID：${writeResult.record ? writeResult.record.record_id : '未知'}`;
      
      setDataText(text);
      setSubmitted(true);
      showToast('✅ 已成功写入飞书表格', 'success');
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
    setLoading(false);
  };
  
  const handleReset = () => {
    setForm({ budgetNo: '', name: '', dept: '', product: '', qty: '', remark: '' });
    setSubmitted(false);
    setValidationError('');
    setDataText('');
  };
  
  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">采购申请</h2>
        <p className="text-sm text-gray-500 mt-1">关联已通过的预算单号，发起真实采购申请</p>
      </div>
      
      {!submitted ? (
        <div className="bg-white rounded-xl card-shadow p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <PrerequisiteAlert items={['必须关联已审批通过的「预算申请」单号', '单号格式应以 YS 开头', '真实采购落地流程']} />
            
            {validationError && <ValidationError message={validationError} />}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <FormInput 
                  label="关联预算单号" 
                  name="budgetNo" 
                  value={form.budgetNo} 
                  onChange={handleChange} 
                  required 
                  placeholder="如：YS2024001（以YS开头）"
                />
              </div>
              
              <FormInput label="需求人名称" name="name" value={form.name} onChange={handleChange} required placeholder="请输入需求人姓名" />
              <FormInput label="所在部门" name="dept" value={form.dept} onChange={handleChange} required placeholder="请输入所在部门" />
              <FormInput label="产品明细" name="product" value={form.product} onChange={handleChange} required placeholder="请输入产品名称/型号" />
              <FormInput label="数量" name="qty" type="number" value={form.qty} onChange={handleChange} required placeholder="请输入数量" />
              <div className="md:col-span-2">
                <FormTextarea label="备注说明" name="remark" value={form.remark} onChange={handleChange} placeholder="请输入其他补充说明（选填）" />
              </div>
            </div>
            
            <div className="mt-6">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary text-white px-8 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
              >
                {loading ? '校验中...' : '提交采购申请'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <SubmitDataPanel 
          title="✅ 采购申请数据已准备好"
          dataText={dataText}
          approvalUrl={FEISHU_CONFIG.purchase.approvalUrl}
          onReset={handleReset}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// 比价汇报Tab
function ComparisonTab({ showToast }) {
  const [form, setForm] = useState({ 
    purchaseNo: '', 
    supplierA: '', priceA: '',
    supplierB: '', priceB: '',
    supplierC: '', priceC: '',
    recommend: '', opinion: ''
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [dataText, setDataText] = useState('');
  
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setValidationError('');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    
    if (!form.purchaseNo || !form.supplierA || !form.priceA || !form.recommend) {
      showToast('请填写所有必填字段', 'error');
      return;
    }
    
    // 校验关联采购申请单号
    setLoading(true);
    try {
      const result = await feishuApi.queryStatus('purchase', form.purchaseNo);
      
      if (!result.exists) {
        setValidationError('❌ 关联的采购申请单号不存在，请先提交采购申请');
        setLoading(false);
        return;
      }
      
      // 直接写入比价结果表格
      const fieldsData = {
        [FEISHU_CONFIG.comparison.fields.primaryName]: form.purchaseNo,
        [FEISHU_CONFIG.comparison.fields.supplierA]: form.supplierA ? `${form.supplierA}: ${Number(form.priceA).toLocaleString()}元` : null,
        [FEISHU_CONFIG.comparison.fields.supplierB]: form.supplierB && form.priceB ? `${form.supplierB}: ${Number(form.priceB).toLocaleString()}元` : null,
        [FEISHU_CONFIG.comparison.fields.supplierC]: form.supplierC && form.priceC ? `${form.supplierC}: ${Number(form.priceC).toLocaleString()}元` : null,
        [FEISHU_CONFIG.comparison.fields.recommend]: form.recommend,
        [FEISHU_CONFIG.comparison.fields.opinion]: form.opinion || '',
        [FEISHU_CONFIG.comparison.fields.status]: STATUS_OPTIONS.comparison
      };
      
      const writeResult = await feishuApi.addRecord(FEISHU_CONFIG.comparison, fieldsData);
      
      const text = `【比价汇报-已提交】
关联采购申请单号：${form.purchaseNo}
供应商A报价：${form.supplierA} ${Number(form.priceA).toLocaleString()}元
${form.supplierB ? `供应商B报价：${form.supplierB} ${Number(form.priceB).toLocaleString()}元` : ''}
${form.supplierC ? `供应商C报价：${form.supplierC} ${Number(form.priceC).toLocaleString()}元` : ''}
推荐供应商：${form.recommend}
选择意见：${form.opinion || '无'}
状态：待审批
记录ID：${writeResult.record ? writeResult.record.record_id : '未知'}`;
      
      setDataText(text);
      setSubmitted(true);
      showToast('✅ 已成功写入飞书表格', 'success');
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
    setLoading(false);
  };
  
  const handleReset = () => {
    setForm({ 
      purchaseNo: '', supplierA: '', priceA: '',
      supplierB: '', priceB: '', supplierC: '', priceC: '',
      recommend: '', opinion: ''
    });
    setSubmitted(false);
    setValidationError('');
    setDataText('');
  };
  
  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">比价汇报</h2>
        <p className="text-sm text-gray-500 mt-1">填写多家供应商报价及推荐意见（后期询价，与前期询价独立）</p>
      </div>
      
      {!submitted ? (
        <div className="bg-white rounded-xl card-shadow p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <PrerequisiteAlert items={['必须关联有效的「采购申请」单号', '单号格式应以 CG 开头', '后期询价用于真实落地采购', '需汇总至少一家供应商报价']} />
            
            {validationError && <ValidationError message={validationError} />}
            
            <div className="mb-6">
              <FormInput 
                label="关联采购申请单号" 
                name="purchaseNo" 
                value={form.purchaseNo} 
                onChange={handleChange} 
                required 
                placeholder="如：CG2024001（以CG开头）"
              />
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-4">供应商报价</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm font-medium text-blue-600 mb-3">供应商 A *</p>
                  <FormInput label="供应商名称" name="supplierA" value={form.supplierA} onChange={handleChange} required placeholder="供应商名称" />
                  <FormInput label="报价金额" name="priceA" type="number" value={form.priceA} onChange={handleChange} required placeholder="金额（元）" />
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm font-medium text-green-600 mb-3">供应商 B</p>
                  <FormInput label="供应商名称" name="supplierB" value={form.supplierB} onChange={handleChange} placeholder="供应商名称" />
                  <FormInput label="报价金额" name="priceB" type="number" value={form.priceB} onChange={handleChange} placeholder="金额（元）" />
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm font-medium text-purple-600 mb-3">供应商 C</p>
                  <FormInput label="供应商名称" name="supplierC" value={form.supplierC} onChange={handleChange} placeholder="供应商名称" />
                  <FormInput label="报价金额" name="priceC" type="number" value={form.priceC} onChange={handleChange} placeholder="金额（元）" />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput label="推荐供应商 *" name="recommend" value={form.recommend} onChange={handleChange} required placeholder="请填写推荐供应商" />
              <FormInput label="选择意见" name="opinion" value={form.opinion} onChange={handleChange} placeholder="请简述推荐理由" />
            </div>
            
            <div className="mt-6">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary text-white px-8 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
              >
                {loading ? '校验中...' : '提交比价汇报'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <SubmitDataPanel 
          title="✅ 比价汇报数据已准备好"
          dataText={dataText}
          approvalUrl={FEISHU_CONFIG.comparison.approvalUrl}
          onReset={handleReset}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// 合同审批Tab
function ContractTab({ showToast }) {
  const [form, setForm] = useState({ 
    comparisonNo: '', 
    amount: '', 
    supplier: '', 
    payment: '', 
    delivery: '' 
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [dataText, setDataText] = useState('');
  
  const paymentOptions = [
    { value: '预付', label: '预付' },
    { value: '分期', label: '分期' },
    { value: '后付', label: '后付' }
  ];
  
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setValidationError('');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    
    if (!form.comparisonNo || !form.amount || !form.supplier || !form.payment || !form.delivery) {
      showToast('请填写所有必填字段', 'error');
      return;
    }
    
    // 校验关联比价单号
    setLoading(true);
    try {
      const result = await feishuApi.queryStatus('comparison', form.comparisonNo);
      
      if (!result.exists) {
        setValidationError('❌ 关联的比价单号不存在，请先提交比价汇报');
        setLoading(false);
        return;
      }
      
      if (result.status !== '已通过') {
        setValidationError('❌ 关联的比价汇报尚未审批通过');
        setLoading(false);
        return;
      }
      
      // 直接写入合同表格
      const fieldsData = {
        [FEISHU_CONFIG.contract.fields.primaryName]: form.comparisonNo,
        [FEISHU_CONFIG.contract.fields.amount]: Number(form.amount),
        [FEISHU_CONFIG.contract.fields.supplier]: form.supplier,
        [FEISHU_CONFIG.contract.fields.payment]: form.payment,
        [FEISHU_CONFIG.contract.fields.delivery]: form.delivery,
        [FEISHU_CONFIG.contract.fields.status]: STATUS_OPTIONS.contract
      };
      
      const writeResult = await feishuApi.addRecord(FEISHU_CONFIG.contract, fieldsData);
      
      const text = `【合同审批-已提交】
关联比价单号：${form.comparisonNo}
合同金额：${Number(form.amount).toLocaleString()}元
供应商名称：${form.supplier}
付款方式：${form.payment}
交付时间：${form.delivery}
状态：待审批
记录ID：${writeResult.record ? writeResult.record.record_id : '未知'}`;
      
      setDataText(text);
      setSubmitted(true);
      showToast('✅ 已成功写入飞书表格', 'success');
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
    setLoading(false);
  };
  
  const handleReset = () => {
    setForm({ comparisonNo: '', amount: '', supplier: '', payment: '', delivery: '' });
    setSubmitted(false);
    setValidationError('');
    setDataText('');
  };
  
  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">合同审批</h2>
        <p className="text-sm text-gray-500 mt-1">比价结果通过后，填写合同信息并提交审批</p>
      </div>
      
      {!submitted ? (
        <div className="bg-white rounded-xl card-shadow p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <PrerequisiteAlert items={['必须关联已审批通过的「比价汇报」单号', '单号格式应以 BJ 开头', '作为最终采购合同审批依据']} />
            
            {validationError && <ValidationError message={validationError} />}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput 
                label="关联比价单号" 
                name="comparisonNo" 
                value={form.comparisonNo} 
                onChange={handleChange} 
                required 
                placeholder="如：BJ2024001（以BJ开头）"
              />
              <FormInput 
                label="合同金额（元）" 
                name="amount" 
                type="number" 
                value={form.amount} 
                onChange={handleChange} 
                required 
                placeholder="请输入合同金额"
              />
              <FormInput 
                label="供应商名称" 
                name="supplier" 
                value={form.supplier} 
                onChange={handleChange} 
                required 
                placeholder="请输入供应商全称"
              />
              <FormSelect 
                label="付款方式" 
                name="payment" 
                value={form.payment} 
                onChange={handleChange} 
                required 
                options={paymentOptions}
                placeholder="请选择付款方式"
              />
              <div className="md:col-span-2">
                <FormInput 
                  label="交付时间" 
                  name="delivery" 
                  value={form.delivery} 
                  onChange={handleChange} 
                  required 
                  placeholder="如：合同签订后15个工作日内"
                />
              </div>
            </div>
            
            <div className="mt-6">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary text-white px-8 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
              >
                {loading ? '校验中...' : '提交合同审批'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <SubmitDataPanel 
          title="✅ 合同审批数据已准备好"
          dataText={dataText}
          approvalUrl={FEISHU_CONFIG.contract.approvalUrl}
          onReset={handleReset}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// 主应用
function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [toast, setToast] = useState(null);
  
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };
  
  const tabs = [
    { label: '询价前期', component: InquiryTab },
    { label: '预算申请', component: BudgetTab },
    { label: '采购申请', component: PurchaseTab },
    { label: '比价汇报', component: ComparisonTab },
    { label: '合同审批', component: ContractTab }
  ];
  
  const CurrentTab = tabs[activeTab].component;
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-gray-800">采购全流程管理系统</h1>
            </div>
            <div className="text-sm text-gray-500">
              专业 · 规范 · 高效
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 -mb-px overflow-x-auto">
            {tabs.map((tab, index) => (
              <TabButton
                key={index}
                active={activeTab === index}
                label={tab.label}
                onClick={() => setActiveTab(index)}
              />
            ))}
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <CurrentTab showToast={showToast} />
      </main>
      
      {/* Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}

// 渲染应用
ReactDOM.createRoot(document.getElementById('app')).render(<App />);
