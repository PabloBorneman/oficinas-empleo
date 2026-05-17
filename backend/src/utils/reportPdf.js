const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getDatabase } = require('../db/database');

const COLORS = [
  '#005b96',
  '#008060',
  '#f59e0b',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#be123c',
  '#334155'
];

function formatReportValue(value) {
  if (value === null || value === undefined) return '';

  const rawValue = String(value);

  if (rawValue === 'true') return 'Sí';
  if (rawValue === 'false') return 'No';

  if (rawValue.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) return parsed.join(', ');
    } catch (_) {}
  }

  return rawValue;
}

function formatStatus(status) {
  if (status === 'active') return 'Activo';
  if (status === 'draft') return 'Borrador';
  if (status === 'archived') return 'Archivado';
  return status || 'Sin estado';
}

function formatScope(scope) {
  if (scope === 'official') return 'Relevamiento oficial unificado';
  if (scope === 'local') return 'Relevamiento local';
  return scope || 'Sin tipo';
}

function normalizeReportText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatDateForReport(value) {
  if (!value) return 'Sin dato';

  const parts = String(value).split('-');

  if (parts.length === 3) {
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  return String(value);
}

function isReportIdentityField(field) {
  const label = normalizeReportText(field.label);

  const identityWords = [
    'nombre',
    'apellido',
    'dni',
    'documento',
    'cuil',
    'cuit',
    'telefono',
    'direccion',
    'domicilio',
    'email',
    'mail',
    'correo'
  ];

  return ['text', 'textarea'].includes(field.type)
    && identityWords.some((word) => label.includes(normalizeReportText(word)));
}

function isMunicipalityOrLocalityField(field) {
  const label = normalizeReportText(field.label);
  return label === 'municipio' || label === 'localidad';
}

function getReportChartMode(field, itemsCount = 0) {
  if (isReportIdentityField(field)) return 'table';
  if (isMunicipalityOrLocalityField(field)) return 'skip';
  if (field.type === 'boolean') return 'donut';

  if (field.type === 'select') {
    return itemsCount <= 5 ? 'donut' : 'columns';
  }

  if (field.type === 'multiselect') return 'columns';
  if (field.type === 'date') return 'date-summary';
  if (field.type === 'number') return 'numeric';

  return 'table';
}

function ensurePdfSpace(doc, requiredSpace = 120) {
  const bottom = doc.page.height - doc.page.margins.bottom;

  if (doc.y + requiredSpace > bottom) {
    doc.addPage();
  }
}

function addPdfHeader(doc, title, subtitle) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bannerHeight = 96;
  const logoPath = path.join(__dirname, '../assets/red.png');

  doc
    .roundedRect(x, y, width, bannerHeight, 16)
    .fill('#13304d');

  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, x + 20, y + 12, {
        fit: [250, 72],
        align: 'left',
        valign: 'center'
      });
    } catch (error) {
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#ffffff')
        .text('Red provincial de oficinas de Empleo', x + 20, y + 34, {
          width: 240
        });
    }
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#ffffff')
      .text('Red provincial de oficinas de Empleo', x + 20, y + 34, {
        width: 240
      });
  }

  const headerText = 'Informe completo del relevamiento';

  // Más cerca del logo, no centrado en el espacio vacío
  const textX = x + 190;
  const textWidth = width - 205;

  doc.font('Helvetica-Bold');

  let headerFontSize = 19;
  doc.fontSize(headerFontSize);

  while (headerFontSize > 12 && doc.widthOfString(headerText) > textWidth) {
    headerFontSize -= 0.5;
    doc.fontSize(headerFontSize);
  }

  doc
    .fillColor('#E6603A')
    .text(headerText, textX, y + 40, {
      width: textWidth,
      align: 'left',
      lineBreak: false
    });

  doc.font('Helvetica');

  doc.y = y + bannerHeight + 18;

  if (subtitle) {
    const parts = String(subtitle).split(' - ');
    const mainTitle = parts.shift() || subtitle;
    const smallSubtitle = parts.join(' - ');

    doc
      .font('Helvetica-Bold')
      .fontSize(19)
      .fillColor('#13304d')
      .text(mainTitle, x, doc.y, {
        width,
        align: 'left'
      });

    if (smallSubtitle) {
      doc
        .moveDown(0.25)
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#475569')
        .text(smallSubtitle, x, doc.y, {
          width,
          align: 'left'
        });
    }

    doc.font('Helvetica');
    doc.moveDown(0.8);
  }
}

function addSectionTitle(doc, title, description = '') {
  ensurePdfSpace(doc, 78);

  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.x = x;

  doc
    .moveDown(0.9)
    .fontSize(13)
    .fillColor('#005b96')
    .text(String(title).toUpperCase(), x, doc.y, {
      width,
      align: 'left',
      continued: false
    });

  if (description) {
    doc
      .moveDown(0.25)
      .fontSize(9)
      .fillColor('#64748b')
      .text(description, x, doc.y, {
        width,
        align: 'left',
        continued: false
      });
  }

  doc
    .moveDown(0.35)
    .strokeColor('#dbe4ef')
    .lineWidth(1)
    .moveTo(x, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();

  doc.moveDown(0.6);
}

function addKeyValue(doc, label, value) {
  doc
    .fontSize(10)
    .fillColor('#334155')
    .text(label + ': ', { continued: true })
    .fillColor('#0f172a')
    .text(String(value ?? ''));
}


function addReportMetaBlock(doc, form) {
  ensurePdfSpace(doc, 120);

  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .roundedRect(x, y, width, 118, 14)
    .fill('#f8fafc');

  doc
    .roundedRect(x, y, width, 118, 14)
    .strokeColor('#dbe4ef')
    .stroke();

  doc
    .fontSize(9)
    .fillColor('#005b96')
    .text('DATOS DEL INFORME', x + 16, y + 14, {
      width: width - 32
    });

  doc
    .fontSize(8)
    .fillColor('#64748b')
    .text('Descripción', x + 16, y + 34, {
      width: 72
    });

  doc
    .fontSize(9)
    .fillColor('#0f172a')
    .text(form.description || 'Sin descripción', x + 92, y + 33, {
      width: width - 108,
      lineGap: 1
    });

  const rowY = y + 72;
  const columns = [
    ['Estado', formatStatus(form.status)],
    ['Tipo', formatScope(form.scope)],
    ['Creado por', form.created_by_name || 'Sin dato'],
    ['Generado', new Date().toLocaleDateString('es-AR')]
  ];

  const gap = 10;
  const colWidth = (width - 32 - gap * 3) / 4;

  columns.forEach(([label, value], index) => {
    const colX = x + 16 + index * (colWidth + gap);

    doc
      .fontSize(7)
      .fillColor('#64748b')
      .text(label, colX, rowY, {
        width: colWidth
      });

    doc
      .fontSize(9)
      .fillColor('#0f172a')
      .text(String(value), colX, rowY + 13, {
        width: colWidth
      });
  });

  doc.y = y + 136;
}

function addMetricCards(doc, metrics) {
  ensurePdfSpace(doc, 94);

  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 10;
  const cardHeight = 74;
  const cardWidth = (width - gap * (metrics.length - 1)) / metrics.length;

  metrics.forEach((metric, index) => {
    const cardX = x + index * (cardWidth + gap);
    const value = String(metric.value ?? '');

    doc.roundedRect(cardX, y, cardWidth, cardHeight, 12).fill('#f8fafc');
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 12).strokeColor('#dbe4ef').stroke();

    doc
      .fontSize(8)
      .fillColor('#64748b')
      .text(metric.label, cardX + 10, y + 12, {
        width: cardWidth - 20
      });

    const valueFontSize = value.length > 18 ? 11 : 17;

    doc
      .font('Helvetica-Bold')
      .fontSize(valueFontSize)
      .fillColor('#0f172a')
      .text(value, cardX + 10, y + 34, {
        width: cardWidth - 20,
        height: cardHeight - 36,
        align: 'left',
        lineGap: 1
      });

    doc.font('Helvetica');
  });

  doc.y = y + cardHeight + 8;
}

function formatPdfPercent(value) {
  return String(value).replace('.', ',');
}

function truncateText(text, maxLength = 28) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + '…';
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function describePieSlice(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', cx, cy,
    'L', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    'Z'
  ].join(' ');
}

function drawChartCard(doc, title, subtitle, height, drawContent) {
  ensurePdfSpace(doc, height + 34);

  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.roundedRect(x, y, width, height, 14).fill('#f8fafc');
  doc.roundedRect(x, y, width, height, 14).strokeColor('#dbe4ef').stroke();

  doc.fontSize(12).fillColor('#0f172a').text(title, x + 16, y + 14, {
    width: width - 32
  });

  if (subtitle) {
    doc.fontSize(8).fillColor('#64748b').text(subtitle, x + 16, y + 31, {
      width: width - 32
    });
  }

  drawContent({
    x: x + 16,
    y: y + 54,
    width: width - 32,
    height: height - 74
  });

  doc.y = y + height + 12;
}

function drawDonutChart(doc, title, items, totalLabel, subtitle) {
  const total = items.reduce((acc, item) => acc + item.count, 0);

  drawChartCard(
    doc,
    title,
    subtitle || 'Distribución porcentual de las respuestas.',
    248,
    ({ x, y, width }) => {
      if (total <= 0) {
        doc.fontSize(9).fillColor('#64748b').text('Sin datos cargados.', x, y);
        return;
      }

      const cx = x + 95;
      const cy = y + 90;
      const radius = 82;
      const innerRadius = 45;

      let currentAngle = 0;

      items.forEach((item, index) => {
        const angle = (item.count / total) * 360;
        const endAngle = currentAngle + angle;
        const color = COLORS[index % COLORS.length];

        if (angle >= 359.9) {
          doc.circle(cx, cy, radius).fill(color);
        } else {
          doc.path(describePieSlice(cx, cy, radius, currentAngle, endAngle)).fill(color);
        }

        currentAngle = endAngle;
      });

      doc.circle(cx, cy, innerRadius).fill('#ffffff');

      const topItem = [...items].sort((a, b) => b.count - a.count)[0];

      doc
        .fontSize(17)
        .fillColor('#0f172a')
        .text(formatPdfPercent(topItem.percentage) + '%', cx - 36, cy - 12, {
          width: 72,
          align: 'center'
        });

      doc
        .fontSize(7)
        .fillColor('#64748b')
        .text('Mayor grupo', cx - 45, cy + 13, {
          width: 90,
          align: 'center'
        });

      const legendX = x + 215;
      let legendY = y + 16;

      items.slice(0, 8).forEach((item, index) => {
        const color = COLORS[index % COLORS.length];

        doc.circle(legendX + 5, legendY + 5, 5).fill(color);

        doc.fontSize(9).fillColor('#0f172a').text(truncateText(item.label, 30), legendX + 18, legendY, {
          width: width - 250
        });

        doc.fontSize(8).fillColor('#64748b').text(
          item.count + ' ' + totalLabel + ' · ' + formatPdfPercent(item.percentage) + '%',
          legendX + 18,
          legendY + 12,
          { width: width - 250 }
        );

        legendY += 30;
      });
    }
  );
}

function drawColumnsChart(doc, title, items, totalLabel, subtitle) {
  drawChartCard(
    doc,
    title,
    subtitle || 'Cantidad de respuestas por categoría.',
    260,
    ({ x, y, width, height }) => {
      if (!items || items.length === 0) {
        doc.fontSize(9).fillColor('#64748b').text('Sin datos cargados.', x, y);
        return;
      }

      const visibleItems = items.slice(0, 10);
      const maxCount = Math.max(...visibleItems.map((item) => item.count), 1);

      const topPadding = 14;
      const bottomPadding = 54;
      const chartTop = y + topPadding;
      const chartBottom = y + height - bottomPadding;
      const columnAreaHeight = chartBottom - chartTop;

      const gap = 12;
      const columnWidth = Math.max(28, Math.min(46, (width - gap * (visibleItems.length - 1)) / visibleItems.length));
      const totalWidth = visibleItems.length * columnWidth + (visibleItems.length - 1) * gap;
      let currentX = x + Math.max(0, (width - totalWidth) / 2);

      visibleItems.forEach((item, index) => {
        const color = COLORS[index % COLORS.length];
        const columnHeight = Math.max(8, (item.count / maxCount) * columnAreaHeight);
        const columnY = chartBottom - columnHeight;

        const labelY = Math.max(y + 2, columnY - 16);

        doc
          .fontSize(8)
          .fillColor('#0f172a')
          .text(String(item.count), currentX - 4, labelY, {
            width: columnWidth + 8,
            align: 'center'
          });

        doc
          .roundedRect(currentX, chartTop, columnWidth, columnAreaHeight, 14)
          .fill('#e2e8f0');

        doc
          .roundedRect(currentX, columnY, columnWidth, columnHeight, 14)
          .fill(color);

        doc
          .fontSize(7)
          .fillColor('#0f172a')
          .text(truncateText(item.label, 16), currentX - 12, chartBottom + 8, {
            width: columnWidth + 24,
            align: 'center'
          });

        doc
          .fontSize(7)
          .fillColor('#64748b')
          .text(String(item.percentage).replace('.', ',') + '%', currentX - 8, chartBottom + 28, {
            width: columnWidth + 16,
            align: 'center'
          });

        currentX += columnWidth + gap;
      });

      if (items.length > visibleItems.length) {
        doc
          .fontSize(8)
          .fillColor('#64748b')
          .text(
            'Se muestran las primeras ' + visibleItems.length + ' opciones. Total de opciones: ' + items.length + '.',
            x,
            y + height - 8
          );
      }
    }
  );
}

function drawHorizontalBarChart(doc, title, items, totalLabel, subtitle) {
  const visibleItems = (items || []).slice(0, 10);
  const height = Math.max(170, 86 + visibleItems.length * 22);

  drawChartCard(
    doc,
    title,
    subtitle || 'Cantidad de respuestas por categoría.',
    height,
    ({ x, y, width }) => {
      if (!visibleItems.length) {
        doc.fontSize(9).fillColor('#64748b').text('Sin datos cargados.', x, y);
        return;
      }

      const maxCount = Math.max(...visibleItems.map((item) => item.count), 1);
      const labelWidth = Math.min(175, width * 0.38);
      const valueWidth = 82;
      const barWidth = width - labelWidth - valueWidth - 20;

      visibleItems.forEach((item, index) => {
        const rowY = y + index * 22;
        const color = COLORS[index % COLORS.length];
        const currentBarWidth = Math.max(8, (item.count / maxCount) * barWidth);

        doc
          .fontSize(8)
          .fillColor('#0f172a')
          .text(String(item.label || 'Sin dato'), x, rowY, {
            width: labelWidth,
            align: 'left'
          });

        doc
          .roundedRect(x + labelWidth + 10, rowY + 3, barWidth, 10, 5)
          .fill('#e2e8f0');

        doc
          .roundedRect(x + labelWidth + 10, rowY + 3, currentBarWidth, 10, 5)
          .fill(color);

        doc
          .fontSize(8)
          .fillColor('#475569')
          .text(
            item.count + ' · ' + String(item.percentage).replace('.', ',') + '%',
            x + labelWidth + 18 + barWidth,
            rowY,
            {
              width: valueWidth,
              align: 'right'
            }
          );
      });

      if (items.length > visibleItems.length) {
        doc
          .fontSize(8)
          .fillColor('#64748b')
          .text(
            'Se muestran las primeras ' + visibleItems.length + ' opciones. Total de opciones: ' + items.length + '.',
            x,
            y + visibleItems.length * 22 + 12
          );
      }
    }
  );
}

function drawNumericSummary(doc, title, summary) {
  drawChartCard(
    doc,
    title,
    'Resumen numérico del campo seleccionado.',
    126,
    ({ x, y, width }) => {
      if (!summary) {
        doc.fontSize(9).fillColor('#64748b').text('Sin datos numéricos cargados.', x, y);
        return;
      }

      const items = [
        ['Total', summary.total],
        ['Promedio', String(summary.average).replace('.', ',')],
        ['Mínimo', summary.min],
        ['Máximo', summary.max]
      ];

      const cardGap = 14;
      const cardWidth = (width - cardGap * 3) / 4;

      items.forEach(([label, value], index) => {
        const cardX = x + index * (cardWidth + cardGap);

        doc.roundedRect(cardX, y + 8, cardWidth, 56, 10).fill('#ffffff');
        doc.roundedRect(cardX, y + 8, cardWidth, 56, 10).strokeColor('#dbe4ef').stroke();

        doc.fontSize(8).fillColor('#64748b').text(label, cardX + 9, y + 19, {
          width: cardWidth - 18
        });

        doc.fontSize(15).fillColor('#0f172a').text(String(value), cardX + 9, y + 34, {
          width: cardWidth - 18
        });
      });
    }
  );
}

function drawDateSummary(doc, title, summary) {
  drawChartCard(
    doc,
    title,
    'Resumen del período relevado.',
    126,
    ({ x, y, width }) => {
      if (!summary) {
        doc.fontSize(9).fillColor('#64748b').text('Sin fechas cargadas.', x, y);
        return;
      }

      const items = [
        ['Primera fecha', formatDateForReport(summary.first)],
        ['Última fecha', formatDateForReport(summary.last)],
        ['Días con carga', summary.uniqueDays],
        ['Registros con fecha', summary.total]
      ];

      const cardGap = 14;
      const cardWidth = (width - cardGap * 3) / 4;

      items.forEach(([label, value], index) => {
        const cardX = x + index * (cardWidth + cardGap);

        doc.roundedRect(cardX, y + 8, cardWidth, 56, 10).fill('#ffffff');
        doc.roundedRect(cardX, y + 8, cardWidth, 56, 10).strokeColor('#dbe4ef').stroke();

        doc.fontSize(8).fillColor('#64748b').text(label, cardX + 9, y + 19, {
          width: cardWidth - 18
        });

        doc.fontSize(12).fillColor('#0f172a').text(String(value), cardX + 9, y + 36, {
          width: cardWidth - 18
        });
      });
    }
  );
}

function getFieldItems(field, submissions) {
  const counts = {};

  for (const submission of submissions) {
    const currentValue = submission.values.find((value) => value.field_id === field.id);

    if (!currentValue) continue;

    if (field.type === 'multiselect') {
      let parsed = [];

      try {
        parsed = JSON.parse(currentValue.value);
      } catch (_) {
        parsed = [];
      }

      for (const item of parsed) {
        const label = formatReportValue(item);
        counts[label] = (counts[label] || 0) + 1;
      }
    } else {
      const label = formatReportValue(currentValue.value);
      counts[label] = (counts[label] || 0) + 1;
    }
  }

  const total = Object.values(counts).reduce((acc, count) => acc + count, 0);

  return Object.entries(counts)
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Number(((count * 100) / total).toFixed(2)) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

function getNumericSummary(field, submissions) {
  const numbers = [];

  for (const submission of submissions) {
    const currentValue = submission.values.find((value) => value.field_id === field.id);

    if (!currentValue) continue;

    const parsed = Number(String(currentValue.value).replace(',', '.'));

    if (Number.isFinite(parsed)) {
      numbers.push(parsed);
    }
  }

  if (numbers.length === 0) return null;

  const sum = numbers.reduce((acc, value) => acc + value, 0);

  return {
    total: numbers.length,
    average: Number((sum / numbers.length).toFixed(2)),
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    values: numbers
  };
}

function getDateSummary(field, submissions) {
  const dates = [];

  for (const submission of submissions) {
    const currentValue = submission.values.find((value) => value.field_id === field.id);

    if (!currentValue || !currentValue.value) continue;

    const value = String(currentValue.value).trim();

    if (!value) continue;

    dates.push(value);
  }

  const uniqueDates = Array.from(new Set(dates)).sort();

  if (uniqueDates.length === 0) return null;

  return {
    total: dates.length,
    first: uniqueDates[0],
    last: uniqueDates[uniqueDates.length - 1],
    uniqueDays: uniqueDates.length
  };
}

function getAgeRangeItems(field, submissions) {
  const ranges = [
    { label: '18 a 25', min: 18, max: 25, count: 0 },
    { label: '26 a 35', min: 26, max: 35, count: 0 },
    { label: '36 a 45', min: 36, max: 45, count: 0 },
    { label: '46 a 60', min: 46, max: 60, count: 0 },
    { label: '61 o más', min: 61, max: Infinity, count: 0 }
  ];

  let total = 0;

  for (const submission of submissions) {
    const currentValue = submission.values.find((value) => value.field_id === field.id);

    if (!currentValue) continue;

    const parsed = Number(String(currentValue.value).replace(',', '.'));

    if (!Number.isFinite(parsed)) continue;

    total += 1;

    const range = ranges.find((item) => parsed >= item.min && parsed <= item.max);

    if (range) {
      range.count += 1;
    }
  }

  return ranges
    .filter((item) => item.count > 0)
    .map((item) => ({
      label: item.label,
      count: item.count,
      percentage: total > 0 ? Number(((item.count * 100) / total).toFixed(2)) : 0
    }));
}

async function getReportData(formId) {
  const db = await getDatabase();

  const form = await db.get(
    `
    SELECT
      forms.id,
      forms.title,
      forms.description,
      forms.active,
      forms.scope,
      forms.status,
      forms.owner_user_id,
      forms.allow_self_assignment,
      forms.created_by,
      users.name AS created_by_name,
      forms.created_at
    FROM forms
    INNER JOIN users ON users.id = forms.created_by
    WHERE forms.id = ?
    `,
    [formId]
  );

  if (!form) return null;

  const fields = await db.all(
    `
    SELECT
      id,
      form_id,
      label,
      type,
      options,
      required,
      field_order,
      created_at
    FROM form_fields
    WHERE form_id = ?
    ORDER BY field_order ASC, id ASC
    `,
    [formId]
  );

  const submissions = await db.all(
    `
    SELECT
      submissions.id,
      submissions.form_id,
      submissions.user_id,
      users.name AS user_name,
      users.username,
      submissions.municipality_name,
      submissions.created_at,
      submissions.updated_at
    FROM submissions
    INNER JOIN users ON users.id = submissions.user_id
    WHERE submissions.form_id = ?
    ORDER BY submissions.municipality_name ASC, submissions.id DESC
    `,
    [formId]
  );

  const submissionsWithValues = [];

  for (const submission of submissions) {
    const values = await db.all(
      `
      SELECT
        submission_values.id,
        submission_values.submission_id,
        submission_values.field_id,
        form_fields.label,
        form_fields.type,
        submission_values.value
      FROM submission_values
      INNER JOIN form_fields ON form_fields.id = submission_values.field_id
      WHERE submission_values.submission_id = ?
      ORDER BY form_fields.field_order ASC, form_fields.id ASC
      `,
      [submission.id]
    );

    submissionsWithValues.push({
      ...submission,
      values
    });
  }

  const submissionsByMunicipality = await db.all(
    `
    SELECT
      municipality_name,
      COUNT(*) AS submissions_count
    FROM submissions
    WHERE form_id = ?
    GROUP BY municipality_name
    ORDER BY submissions_count DESC, municipality_name ASC
    `,
    [formId]
  );

  return {
    form,
    fields,
    submissionsWithValues,
    submissionsByMunicipality
  };
}

function getSafeTitle(form, formId, prefix) {
  const safeTitle = String(form.title || 'relevamiento')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 70);

  return prefix + '-' + (safeTitle || 'relevamiento') + '-' + formId + '.pdf';
}

function findFieldByLabels(fields, labels) {
  const normalizedLabels = labels.map((label) => normalizeReportText(label));

  return fields.find((field) => {
    const normalized = normalizeReportText(field.label);
    return normalizedLabels.includes(normalized);
  });
}

function drawFieldByLabel(doc, fields, submissions, labels, customTitle = null, forcedMode = null) {
  const field = findFieldByLabels(fields, labels);

  if (!field) return;

  const items = getFieldItems(field, submissions);
  const mode = forcedMode || getReportChartMode(field, items.length);
  const title = customTitle || field.label;

  if (mode === 'skip' || mode === 'table') return;

  if (mode === 'date-summary') {
    drawDateSummary(doc, title, getDateSummary(field, submissions));
    return;
  }

  if (mode === 'numeric') {
    const summary = getNumericSummary(field, submissions);
    drawNumericSummary(doc, title, summary);

    if (normalizeReportText(field.label).includes('edad')) {
      drawColumnsChart(
        doc,
        'Edad por rangos',
        getAgeRangeItems(field, submissions),
        'personas',
        'Distribución de personas relevadas por grupo etario.'
      );
    }

    return;
  }

  const totalLabel = field.type === 'multiselect' ? 'selecciones' : 'respuestas';

  if (mode === 'donut') {
    drawDonutChart(doc, title, items, totalLabel);
    return;
  }

  if (mode === 'horizontal') {
    drawHorizontalBarChart(doc, title, items, totalLabel);
    return;
  }

  drawColumnsChart(doc, title, items, totalLabel);
}


function getBooleanFieldSummary(fields, submissions, labels) {
  const field = findFieldByLabels(fields, labels);

  if (!field) {
    return null;
  }

  let yes = 0;
  let no = 0;

  for (const submission of submissions) {
    const currentValue = submission.values.find((value) => value.field_id === field.id);

    if (!currentValue) continue;

    const value = String(currentValue.value);

    if (value === 'true') {
      yes += 1;
    }

    if (value === 'false') {
      no += 1;
    }
  }

  return {
    yes,
    no,
    total: yes + no
  };
}

function getMultiselectTotalSelections(fields, submissions, labels) {
  const field = findFieldByLabels(fields, labels);

  if (!field) {
    return 0;
  }

  let total = 0;

  for (const submission of submissions) {
    const currentValue = submission.values.find((value) => value.field_id === field.id);

    if (!currentValue) continue;

    try {
      const parsed = JSON.parse(currentValue.value);

      if (Array.isArray(parsed)) {
        total += parsed.length;
      }
    } catch (_) {}
  }

  return total;
}

function getTopItemText(fields, submissions, labels) {
  const field = findFieldByLabels(fields, labels);

  if (!field) return 'Sin datos suficientes.';

  const items = getFieldItems(field, submissions);

  if (!items.length) return 'Sin datos suficientes.';

  const top = items[0];

  return top.label + ' (' + top.count + ' registros, ' + String(top.percentage).replace('.', ',') + '%)';
}


function drawDisabilityTypeChart(doc, fields, submissions) {
  const disabilitySummary = getBooleanFieldSummary(
    fields,
    submissions,
    ['¿Tiene certificado de discapacidad?']
  );

  const totalSelections = getMultiselectTotalSelections(
    fields,
    submissions,
    ['Tipo de discapacidad']
  );

  const subtitle = disabilitySummary
    ? 'Base: ' + disabilitySummary.yes + ' personas que declararon certificado de discapacidad. Total de selecciones: ' + totalSelections + '.'
    : 'Base: personas que declararon certificado de discapacidad. Total de selecciones: ' + totalSelections + '.';

  const field = findFieldByLabels(fields, ['Tipo de discapacidad']);

  if (!field) {
    return;
  }

  const items = getFieldItems(field, submissions);

  drawHorizontalBarChart(
    doc,
    'Tipo de discapacidad',
    items,
    'selecciones',
    subtitle
  );
}

function addConclusionBlock(doc, fields, submissions, submissionsByMunicipality) {
  addSectionTitle(doc, 'Síntesis general', 'Lectura automática de los principales resultados del relevamiento.');

  const topMunicipality = submissionsByMunicipality[0];
  const total = submissions.length;

  ensurePdfSpace(doc, 180);

  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.roundedRect(x, y, width, 170, 14).fill('#f8fafc');
  doc.roundedRect(x, y, width, 170, 14).strokeColor('#dbe4ef').stroke();

  const lines = [
    'El relevamiento reúne ' + total + ' respuestas provenientes de ' + submissionsByMunicipality.length + ' municipios participantes.',
    'La mayor cantidad de cargas corresponde a ' + (topMunicipality ? topMunicipality.municipality_name + ' (' + topMunicipality.submissions_count + ' respuestas).' : 'sin dato.'),
    'Situación laboral predominante: ' + getTopItemText(fields, submissions, ['Situación laboral actual']),
    'Nivel educativo más frecuente: ' + getTopItemText(fields, submissions, ['Nivel educativo alcanzado']),
    'Capacitación más solicitada: ' + getTopItemText(fields, submissions, ['Capacitaciones de interés']),
    'Derivación sugerida predominante: ' + getTopItemText(fields, submissions, ['Derivación sugerida'])
  ];

  let currentY = y + 16;

  lines.forEach((line) => {
    doc
      .fontSize(10)
      .fillColor('#0f172a')
      .text('• ' + line, x + 18, currentY, {
        width: width - 36,
        lineGap: 2
      });

    currentY = doc.y + 7;
  });

  doc.y = y + 186;
}

function setupPageFooter(doc) {
  return function finishFooter() {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const pageNumber = i - range.start + 1;
      const totalPages = range.count;

      const oldX = doc.x;
      const oldY = doc.y;

      const x = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // Importante: tiene que quedar dentro del área segura.
      // Si se dibuja demasiado abajo, PDFKit crea páginas nuevas.
      const footerY = doc.page.height - doc.page.margins.bottom - 18;

      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(x, footerY - 7)
        .lineTo(doc.page.width - doc.page.margins.right, footerY - 7)
        .stroke();

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#64748b')
        .text('Sistema Oficinas de Empleo', x, footerY, {
          width: width / 2,
          height: 10,
          align: 'left',
          lineBreak: false
        });

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#64748b')
        .text('Página ' + pageNumber + ' de ' + totalPages, x + width / 2, footerY, {
          width: width / 2,
          height: 10,
          align: 'right',
          lineBreak: false
        });

      doc.x = oldX;
      doc.y = oldY;
    }
  };
}

async function generateFormReportPdf(formId, res) {
  const data = await getReportData(formId);

  if (!data) {
    res.status(404).json({
      ok: false,
      message: 'Relevamiento no encontrado'
    });
    return;
  }

  const { form, fields, submissionsWithValues, submissionsByMunicipality } = data;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + getSafeTitle(form, formId, 'informe') + '"');

  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: 'Informe - ' + form.title,
      Author: 'Sistema Oficinas de Empleo'
    }
  });

  doc.pipe(res);

  const finishFooter = setupPageFooter(doc);

  addPdfHeader(doc, 'Informe completo del relevamiento', form.title);

  addKeyValue(doc, 'Descripción', form.description || 'Sin descripción');
  addKeyValue(doc, 'Estado', formatStatus(form.status));
  addKeyValue(doc, 'Tipo', formatScope(form.scope));
  addKeyValue(doc, 'Creado por', form.created_by_name || 'Sin dato');
  addKeyValue(doc, 'Fecha de generación', new Date().toLocaleString('es-AR'));

  addSectionTitle(doc, 'Resumen ejecutivo');

  const topMunicipality = submissionsByMunicipality[0];

  addMetricCards(doc, [
    { label: 'Total de respuestas', value: submissionsWithValues.length },
    { label: 'Municipios participantes', value: submissionsByMunicipality.length },
    { label: 'Campos relevados', value: fields.length },
    { label: 'Mayor carga', value: topMunicipality ? topMunicipality.municipality_name : 'Sin dato' }
  ]);

  addSectionTitle(doc, 'Distribución territorial', 'Cantidad de respuestas cargadas por cada municipio participante.');

  drawHorizontalBarChart(
    doc,
    'Respuestas por municipio',
    submissionsByMunicipality.map((item) => ({
      label: item.municipality_name || 'Sin municipio',
      count: Number(item.submissions_count || 0),
      percentage: submissionsWithValues.length > 0
        ? Number(((Number(item.submissions_count || 0) * 100) / submissionsWithValues.length).toFixed(2))
        : 0
    })),
    'respuestas',
    'Distribución territorial de las respuestas cargadas. Se muestran los municipios con mayor cantidad de registros.'
  );

  drawFieldByLabel(
    doc,
    fields,
    submissionsWithValues,
    ['Fecha de relevamiento'],
    'Período relevado',
    'date-summary'
  );

  addSectionTitle(doc, 'Perfil de las personas relevadas', 'Características generales de la población registrada.');

  drawFieldByLabel(doc, fields, submissionsWithValues, ['Edad'], 'Resumen de edad', 'numeric');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['Género'], 'Distribución por género', 'donut');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['Estado civil'], 'Estado civil', 'donut');

  addSectionTitle(doc, 'Educación y formación', 'Nivel educativo, continuidad de estudios y conocimientos declarados.');

  drawFieldByLabel(doc, fields, submissionsWithValues, ['Nivel educativo alcanzado'], 'Nivel educativo alcanzado', 'columns');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['¿Sigue estudiando?'], 'Continuidad educativa', 'donut');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['Conocimientos declarados'], 'Conocimientos declarados', 'columns');

  addSectionTitle(doc, 'Situación laboral', 'Condición laboral actual, experiencia y trabajo por cuenta propia.');

  drawFieldByLabel(doc, fields, submissionsWithValues, ['Situación laboral actual'], 'Situación laboral actual', 'donut');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['Área de experiencia laboral'], 'Área de experiencia laboral', 'columns');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['¿Trabaja o trabajó por cuenta propia?'], 'Trabajo por cuenta propia', 'donut');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['¿Hizo cursos de capacitación?'], 'Cursos de capacitación realizados', 'donut');

  addSectionTitle(doc, 'Intereses y derivación', 'Capacitaciones solicitadas, ocupación buscada y posibles líneas de derivación.');

  drawFieldByLabel(doc, fields, submissionsWithValues, ['Capacitaciones de interés'], 'Capacitaciones de interés', 'horizontal');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['Ocupación buscada'], 'Ocupación buscada', 'horizontal');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['Horario disponible'], 'Horario disponible', 'donut');
  drawFieldByLabel(doc, fields, submissionsWithValues, ['Derivación sugerida'], 'Derivación sugerida', 'horizontal');

  addSectionTitle(doc, 'Discapacidad y apoyos', 'Información general para considerar accesibilidad y posibles apoyos.');

  drawFieldByLabel(doc, fields, submissionsWithValues, ['¿Tiene certificado de discapacidad?'], 'Certificado de discapacidad', 'donut');
  drawDisabilityTypeChart(doc, fields, submissionsWithValues);

  addConclusionBlock(doc, fields, submissionsWithValues, submissionsByMunicipality);

  finishFooter();

  doc.end();
}

async function generateFormHistoryPdf(formId, res) {
  const data = await getReportData(formId);

  if (!data) {
    res.status(404).json({
      ok: false,
      message: 'Relevamiento no encontrado'
    });
    return;
  }

  const { form, submissionsWithValues, submissionsByMunicipality } = data;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + getSafeTitle(form, formId, 'historial-respuestas') + '"');

  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: 'Historial de respuestas - ' + form.title,
      Author: 'Sistema Oficinas de Empleo'
    }
  });

  doc.pipe(res);

  addPdfHeader(doc, 'Historial de respuestas', form.title);

  addKeyValue(doc, 'Total de respuestas', submissionsWithValues.length);
  addKeyValue(doc, 'Municipios participantes', submissionsByMunicipality.length);
  addKeyValue(doc, 'Fecha de generación', new Date().toLocaleString('es-AR'));

  addSectionTitle(doc, 'Resumen por municipio');

  submissionsByMunicipality.forEach((item) => {
    addKeyValue(doc, item.municipality_name || 'Sin municipio', item.submissions_count + ' respuestas');
  });

  const grouped = new Map();

  for (const submission of submissionsWithValues) {
    const municipalityName = submission.municipality_name || 'Sin municipio';

    if (!grouped.has(municipalityName)) {
      grouped.set(municipalityName, []);
    }

    grouped.get(municipalityName).push(submission);
  }

  for (const [municipalityName, submissions] of grouped.entries()) {
    addSectionTitle(doc, municipalityName + ' - Historial de cargas');

    submissions.forEach((submission) => {
      ensurePdfSpace(doc, 150);

      doc
        .fontSize(11)
        .fillColor('#0f172a')
        .text('Respuesta #' + submission.id);

      doc
        .fontSize(8)
        .fillColor('#64748b')
        .text('Fecha de carga: ' + submission.created_at);

      submission.values.forEach((value) => {
        ensurePdfSpace(doc, 16);

        doc
          .fontSize(8)
          .fillColor('#475569')
          .text(value.label + ': ', { continued: true })
          .fillColor('#0f172a')
          .text(formatReportValue(value.value));
      });

      doc.moveDown(0.7);
    });
  }

  doc.end();
}

module.exports = {
  generateFormReportPdf,
  generateFormHistoryPdf
};










