#!/bin/bash
# ============================================================
# 安全审计脚本
#
# 功能：
#   1. npm audit — 检查已知漏洞
#   2. 检查过时的依赖
#   3. 依赖统计
#
# 使用方法：
#   bash scripts/audit.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  piagent 安全审计"
echo "=========================================="
echo ""

# 1. npm audit
echo -e "${YELLOW}[1/3] 检查已知漏洞 (npm audit)...${NC}"
if npm audit --audit-level=high 2>&1; then
  echo -e "${GREEN}✅ 未发现高危漏洞${NC}"
else
  echo -e "${RED}⚠️  发现漏洞，请检查上方详情${NC}"
fi
echo ""

# 2. 检查过时的依赖
echo -e "${YELLOW}[2/3] 检查过时依赖 (npm outdated)...${NC}"
if npm outdated 2>&1 | grep -q .; then
  npm outdated
  echo -e "${YELLOW}⚠️  存在过时依赖，建议更新${NC}"
else
  echo -e "${GREEN}✅ 所有依赖均为最新${NC}"
fi
echo ""

# 3. 依赖数量和大小
echo -e "${YELLOW}[3/3] 依赖统计...${NC}"
DIRECT_DEPS=$(node -e "const p=require('./package.json'); console.log(p.dependencies?Object.keys(p.dependencies).length:0)")
DEV_DEPS=$(node -e "const p=require('./package.json'); console.log(p.devDependencies?Object.keys(p.devDependencies).length:0)")
echo "   生产依赖: ${DIRECT_DEPS} 个"
echo "   开发依赖: ${DEV_DEPS} 个"

if [ -d "node_modules" ]; then
  TOTAL_MODULES=$(find node_modules -maxdepth 1 -type d 2>/dev/null | wc -l)
  TOTAL_SIZE=$(du -sh node_modules 2>/dev/null | cut -f1)
  echo "   已安装包: ${TOTAL_MODULES} 个"
  echo "   总大小: ${TOTAL_SIZE}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}审计完成${NC}"
echo "=========================================="