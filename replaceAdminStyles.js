const fs = require('fs');
const path = require('path');

const dir = 'c:\\ProjectTelegramBot\\BotNot\\frontend\\src\\pages\\AdminPanel';
const files = fs.readdirSync(dir).filter(f => f.startsWith('Admin') && f.endsWith('.tsx') && f !== 'AdminDashboard.tsx');

const OLD_CARD_STYLE = `background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'`;

const NEW_CARD_STYLE = `background: 'var(--bg-card)',
    backdropFilter: 'blur(24px)',
    border: '1px solid var(--border-strong)',
    boxShadow: 'var(--shadow-lg)'`;

const OLD_MINI_CARD = `const miniCardStyle = { background: 'var(--bg-hover)' };`;
const NEW_MINI_CARD = `const miniCardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-glass)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.2s ease-out'
  };`;

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    if (content.includes(OLD_CARD_STYLE)) {
        content = content.replace(OLD_CARD_STYLE, NEW_CARD_STYLE);
        changed = true;
    }

    if (content.includes(OLD_MINI_CARD)) {
        content = content.replace(OLD_MINI_CARD, NEW_MINI_CARD);
        changed = true;
    }

    // Common inline styles
    const inlineOld1 = `style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}`;
    const inlineNew1 = `style={{ background: 'var(--bg-card)', backdropFilter: 'blur(24px)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}`;
    if (content.includes(inlineOld1)) {
        content = content.split(inlineOld1).join(inlineNew1);
        changed = true;
    }

    const inlineOld2 = `style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}`;
    const inlineNew2 = `style={{ background: 'var(--bg-card)', backdropFilter: 'blur(16px)', borderColor: 'var(--border-strong)' }}`;
    if (content.includes(inlineOld2)) {
        content = content.split(inlineOld2).join(inlineNew2);
        changed = true;
    }

    const inlineOld3 = `style={{ background: 'var(--bg-card-solid)' }}`;
    const inlineNew3 = `style={{ background: 'var(--bg-card)', backdropFilter: 'blur(16px)' }}`;
    if (content.includes(inlineOld3)) {
        content = content.split(inlineOld3).join(inlineNew3);
        changed = true;
    }

    const inlineOld4 = `style={{ background: 'var(--bg-hover)' }}`;
    const inlineNew4 = `style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)' }}`;
    if (content.includes(inlineOld4)) {
        content = content.split(inlineOld4).join(inlineNew4);
        changed = true;
    }

    // Users page specific
    if (content.includes(`background: 'var(--bg-card)'`) && file === 'AdminUsers.tsx' && !content.includes('backdropFilter')) {
        content = content.replace(/background: 'var\(--bg-card\)'/g, `background: 'var(--bg-card)', backdropFilter: 'blur(16px)'`);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    }
}
