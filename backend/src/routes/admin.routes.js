const express = require('express');
const bcrypt = require('bcryptjs');
const { generateFormReportPdf, generateFormHistoryPdf } = require('../utils/reportPdf');

const { getDatabase } = require('../db/database');
const { authenticateToken, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

const FIELD_TYPES = [
  'text',
  'number',
  'select',
  'multiselect',
  'boolean',
  'date',
  'textarea'
];

router.use(authenticateToken);
router.use(requireRole('admin'));

router.get('/me', async (req, res) => {
  res.json({
    ok: true,
    message: 'Ruta admin protegida funcionando',
    user: req.user
  });
});

router.get('/users', async (req, res) => {
  const db = await getDatabase();

  const users = await db.all(`
    SELECT
      id,
      name,
      username,
      role,
      municipality_name,
      active,
      created_at
    FROM users
    ORDER BY id ASC;
  `);

  res.json({
    ok: true,
    users
  });
});

router.post('/users', async (req, res) => {
  try {
    const {
      name,
      username,
      password,
      role,
      municipality_name
    } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({
        ok: false,
        message: 'name, username, password y role son obligatorios'
      });
    }

    if (!['admin', 'municipio'].includes(role)) {
      return res.status(400).json({
        ok: false,
        message: 'El role debe ser admin o municipio'
      });
    }

    if (role === 'municipio' && !municipality_name) {
      return res.status(400).json({
        ok: false,
        message: 'municipality_name es obligatorio para usuarios municipio'
      });
    }

    const db = await getDatabase();

    const existingUser = await db.get(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUser) {
      return res.status(409).json({
        ok: false,
        message: 'Ya existe un usuario con ese username'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.run(
      `
      INSERT INTO users (
        name,
        username,
        password_hash,
        role,
        municipality_name,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        username,
        passwordHash,
        role,
        role === 'municipio' ? municipality_name : null,
        1
      ]
    );

    const createdUser = await db.get(
      `
      SELECT
        id,
        name,
        username,
        role,
        municipality_name,
        active,
        created_at
      FROM users
      WHERE id = ?
      `,
      [result.lastID]
    );

    return res.status(201).json({
      ok: true,
      message: 'Usuario creado correctamente',
      user: createdUser
    });
  } catch (error) {
    console.error('Error creando usuario:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms', async (req, res) => {
  const db = await getDatabase();

  const forms = await db.all(`
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
    ORDER BY forms.id DESC;
  `);

  res.json({
    ok: true,
    forms
  });
});

router.post('/forms', async (req, res) => {
  try {
    const {
      title,
      description
    } = req.body;

    if (!title) {
      return res.status(400).json({
        ok: false,
        message: 'El titulo del relevamiento es obligatorio'
      });
    }

    const db = await getDatabase();

    const result = await db.run(
      `
      INSERT INTO forms (
        title,
        description,
        active,
        created_by
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        title,
        description || null,
        1,
        req.user.id
      ]
    );

    const createdForm = await db.get(
      `
      SELECT
        id,
        title,
        description,
        active,
        created_by,
        created_at
      FROM forms
      WHERE id = ?
      `,
      [result.lastID]
    );

    return res.status(201).json({
      ok: true,
      message: 'Relevamiento creado correctamente',
      form: createdForm
    });
  } catch (error) {
    console.error('Error creando relevamiento:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/fields', async (req, res) => {
  const formId = Number(req.params.formId);

  if (!formId) {
    return res.status(400).json({
      ok: false,
      message: 'formId invalido'
    });
  }

  const db = await getDatabase();

  const form = await db.get(
    'SELECT id, title, description, active, scope, status, owner_user_id, allow_self_assignment FROM forms WHERE id = ?',
    [formId]
  );

  if (!form) {
    return res.status(404).json({
      ok: false,
      message: 'Relevamiento no encontrado'
    });
  }

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
    ORDER BY field_order ASC, id ASC;
    `,
    [formId]
  );

  const parsedFields = fields.map((field) => ({
    ...field,
    options: field.options ? JSON.parse(field.options) : null,
    required: field.required === 1
  }));

  res.json({
    ok: true,
    form,
    fields: parsedFields
  });
});

router.post('/forms/:formId/fields', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    const {
      label,
      type,
      options,
      required,
      field_order
    } = req.body;

    if (!label || !type) {
      return res.status(400).json({
        ok: false,
        message: 'label y type son obligatorios'
      });
    }

    if (!FIELD_TYPES.includes(type)) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo de campo invalido'
      });
    }

    if (['select', 'multiselect'].includes(type)) {
      if (!Array.isArray(options) || options.length === 0) {
        return res.status(400).json({
          ok: false,
          message: 'Los campos select y multiselect requieren options'
        });
      }
    }

    const db = await getDatabase();

    const form = await db.get(
      'SELECT id FROM forms WHERE id = ?',
      [formId]
    );

    if (!form) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado'
      });
    }

    const normalizedOptions = ['select', 'multiselect'].includes(type)
      ? JSON.stringify(options)
      : null;


    const submissionsCountResult = await db.get(
      `
      SELECT COUNT(*) AS total
      FROM submissions
      WHERE form_id = ?
      `,
      [formId]
    );

    if (Number(submissionsCountResult?.total || 0) > 0) {
      return res.status(409).json({
        ok: false,
        message: 'No se pueden modificar los campos porque el relevamiento ya tiene respuestas cargadas. Para cambiar la estructura, crea un nuevo relevamiento.'
      });
    }

    const result = await db.run(
      `
      INSERT INTO form_fields (
        form_id,
        label,
        type,
        options,
        required,
        field_order
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        formId,
        label,
        type,
        normalizedOptions,
        required ? 1 : 0,
        Number.isInteger(field_order) ? field_order : 0
      ]
    );

    const createdField = await db.get(
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
      WHERE id = ?
      `,
      [result.lastID]
    );

    return res.status(201).json({
      ok: true,
      message: 'Campo agregado correctamente',
      field: {
        ...createdField,
        options: createdField.options ? JSON.parse(createdField.options) : null,
        required: createdField.required === 1
      }
    });
  } catch (error) {
    console.error('Error creando campo:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/assignments', async (req, res) => {
  const formId = Number(req.params.formId);

  if (!formId) {
    return res.status(400).json({
      ok: false,
      message: 'formId invalido'
    });
  }

  const db = await getDatabase();

  const form = await db.get(
    'SELECT id, title, description, active, scope, status, owner_user_id, allow_self_assignment FROM forms WHERE id = ?',
    [formId]
  );

  if (!form) {
    return res.status(404).json({
      ok: false,
      message: 'Relevamiento no encontrado'
    });
  }

  const assignments = await db.all(
    `
    SELECT
      form_assignments.id,
      form_assignments.form_id,
      form_assignments.user_id,
      users.name AS user_name,
      users.username,
      users.municipality_name,
      form_assignments.assigned_at
    FROM form_assignments
    INNER JOIN users ON users.id = form_assignments.user_id
    WHERE form_assignments.form_id = ?
    ORDER BY users.municipality_name ASC;
    `,
    [formId]
  );

  res.json({
    ok: true,
    form,
    assignments
  });
});

router.post('/forms/:formId/assignments', async (req, res) => {
  try {
    const formId = Number(req.params.formId);
    const { user_ids } = req.body;

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'user_ids debe ser un array con al menos un usuario municipio'
      });
    }

    const db = await getDatabase();

    const form = await db.get(
      'SELECT id FROM forms WHERE id = ?',
      [formId]
    );

    if (!form) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado'
      });
    }

    const createdAssignments = [];

    for (const userId of user_ids) {
      const user = await db.get(
        `
        SELECT id, name, username, role, municipality_name, active
        FROM users
        WHERE id = ?
        `,
        [userId]
      );

      if (!user) {
        return res.status(404).json({
          ok: false,
          message: `Usuario no encontrado: ${userId}`
        });
      }

      if (user.role !== 'municipio') {
        return res.status(400).json({
          ok: false,
          message: `El usuario ${user.username} no es de tipo municipio`
        });
      }

      if (user.active !== 1) {
        return res.status(400).json({
          ok: false,
          message: `El usuario ${user.username} esta inactivo`
        });
      }

      await db.run(
        `
        INSERT OR IGNORE INTO form_assignments (
          form_id,
          user_id
        )
        VALUES (?, ?)
        `,
        [formId, userId]
      );

      const assignment = await db.get(
        `
        SELECT
          form_assignments.id,
          form_assignments.form_id,
          form_assignments.user_id,
          users.name AS user_name,
          users.username,
          users.municipality_name,
          form_assignments.assigned_at
        FROM form_assignments
        INNER JOIN users ON users.id = form_assignments.user_id
        WHERE form_assignments.form_id = ?
          AND form_assignments.user_id = ?
        `,
        [formId, userId]
      );

      createdAssignments.push(assignment);
    }

    return res.status(201).json({
      ok: true,
      message: 'Relevamiento asignado correctamente',
      assignments: createdAssignments
    });
  } catch (error) {
    console.error('Error asignando relevamiento:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});


router.get('/forms/:formId/submissions', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    const db = await getDatabase();

    const form = await db.get(
      'SELECT id, title, description, active, scope, status, owner_user_id, allow_self_assignment FROM forms WHERE id = ?',
      [formId]
    );

    if (!form) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado'
      });
    }

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
      ORDER BY submissions.id DESC;
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
        ORDER BY form_fields.field_order ASC, form_fields.id ASC;
        `,
        [submission.id]
      );

      submissionsWithValues.push({
        ...submission,
        values
      });
    }

    return res.json({
      ok: true,
      form,
      submissions: submissionsWithValues
    });
  } catch (error) {
    console.error('Error listando respuestas admin:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/stats', async (req, res) => {
  try {
    const formId = Number(req.params.formId);
    const fieldId = Number(req.query.field_id);
    const municipalityName = req.query.municipality_name || null;

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    if (!fieldId) {
      return res.status(400).json({
        ok: false,
        message: 'field_id es obligatorio'
      });
    }

    const db = await getDatabase();

    const form = await db.get(
      'SELECT id, title, description, active, scope, status, owner_user_id, allow_self_assignment FROM forms WHERE id = ?',
      [formId]
    );

    if (!form) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado'
      });
    }

    const field = await db.get(
      `
      SELECT
        id,
        form_id,
        label,
        type,
        options,
        required,
        field_order
      FROM form_fields
      WHERE id = ?
        AND form_id = ?
      `,
      [fieldId, formId]
    );

    if (!field) {
      return res.status(404).json({
        ok: false,
        message: 'Campo no encontrado para este relevamiento'
      });
    }

    const params = [formId, fieldId];

    let municipalityFilter = '';

    if (municipalityName) {
      municipalityFilter = 'AND submissions.municipality_name = ?';
      params.push(municipalityName);
    }

    const rows = await db.all(
      `
      SELECT
        submission_values.value,
        submissions.municipality_name
      FROM submission_values
      INNER JOIN submissions ON submissions.id = submission_values.submission_id
      WHERE submissions.form_id = ?
        AND submission_values.field_id = ?
        ${municipalityFilter}
      `,
      params
    );

    const counts = {};

    for (const row of rows) {
      if (field.type === 'multiselect') {
        let values = [];

        try {
          values = JSON.parse(row.value);
        } catch (_) {
          values = [];
        }

        for (const item of values) {
          counts[item] = (counts[item] || 0) + 1;
        }
      } else {
        counts[row.value] = (counts[row.value] || 0) + 1;
      }
    }

    const total = Object.values(counts).reduce((acc, value) => acc + value, 0);

    const items = Object.entries(counts).map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Number(((count * 100) / total).toFixed(2)) : 0
    }));

    return res.json({
      ok: true,
      form,
      field: {
        id: field.id,
        label: field.label,
        type: field.type
      },
      scope: form.scope === 'local' ? 'local' : (municipalityName ? 'municipio' : 'unificado'),
      municipality_name: municipalityName,
      total,
      items,
      chart: {
        labels: items.map((item) => item.label),
        data: items.map((item) => item.count)
      }
    });
  } catch (error) {
    console.error('Error generando estadisticas:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/comparison', async (req, res) => {
  try {
    const formId = Number(req.params.formId);
    const fieldId = Number(req.query.field_id);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    if (!fieldId) {
      return res.status(400).json({
        ok: false,
        message: 'field_id es obligatorio'
      });
    }

    const db = await getDatabase();

    const form = await db.get(
      'SELECT id, title, description, active, scope, status, owner_user_id, allow_self_assignment FROM forms WHERE id = ?',
      [formId]
    );

    if (!form) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado'
      });
    }

    const field = await db.get(
      `
      SELECT
        id,
        form_id,
        label,
        type,
        options,
        required,
        field_order
      FROM form_fields
      WHERE id = ?
        AND form_id = ?
      `,
      [fieldId, formId]
    );

    if (!field) {
      return res.status(404).json({
        ok: false,
        message: 'Campo no encontrado para este relevamiento'
      });
    }

    const rows = await db.all(
      `
      SELECT
        submissions.municipality_name,
        submission_values.value
      FROM submission_values
      INNER JOIN submissions ON submissions.id = submission_values.submission_id
      WHERE submissions.form_id = ?
        AND submission_values.field_id = ?
      ORDER BY submissions.municipality_name ASC;
      `,
      [formId, fieldId]
    );

    const municipalityMap = {};
    const globalLabelsSet = new Set();

    for (const row of rows) {
      const municipalityName = row.municipality_name;

      if (!municipalityMap[municipalityName]) {
        municipalityMap[municipalityName] = {
          municipality_name: municipalityName,
          total: 0,
          counts: {}
        };
      }

      if (field.type === 'multiselect') {
        let values = [];

        try {
          values = JSON.parse(row.value);
        } catch (_) {
          values = [];
        }

        for (const item of values) {
          municipalityMap[municipalityName].counts[item] =
            (municipalityMap[municipalityName].counts[item] || 0) + 1;

          municipalityMap[municipalityName].total += 1;
          globalLabelsSet.add(item);
        }
      } else {
        municipalityMap[municipalityName].counts[row.value] =
          (municipalityMap[municipalityName].counts[row.value] || 0) + 1;

        municipalityMap[municipalityName].total += 1;
        globalLabelsSet.add(row.value);
      }
    }

    const labels = Array.from(globalLabelsSet);

    const municipalities = Object.values(municipalityMap).map((municipality) => {
      const items = labels.map((label) => {
        const count = municipality.counts[label] || 0;

        return {
          label,
          count,
          percentage: municipality.total > 0
            ? Number(((count * 100) / municipality.total).toFixed(2))
            : 0
        };
      });

      return {
        municipality_name: municipality.municipality_name,
        total: municipality.total,
        items
      };
    });

    const chart = {
      labels,
      datasets: municipalities.map((municipality) => ({
        label: municipality.municipality_name,
        data: labels.map((label) => {
          const item = municipality.items.find((currentItem) => currentItem.label === label);
          return item ? item.count : 0;
        })
      }))
    };

    return res.json({
      ok: true,
      form,
      field: {
        id: field.id,
        label: field.label,
        type: field.type
      },
      scope: 'comparativo',
      municipalities,
      chart
    });
  } catch (error) {
    console.error('Error generando comparativa:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});



router.get('/forms/:formId/report/pdf', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    await generateFormReportPdf(formId, res);
  } catch (error) {
    console.error('Error generando informe PDF:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        message: 'Error interno al generar informe PDF'
      });
    }

    return res.end();
  }
});

router.get('/forms/:formId/history/pdf', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    await generateFormHistoryPdf(formId, res);
  } catch (error) {
    console.error('Error generando historial PDF:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        message: 'Error interno al generar historial PDF'
      });
    }

    return res.end();
  }
});
router.patch('/forms/:formId/archive', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    const db = await getDatabase();

    const form = await db.get(
      `
      SELECT
        id,
        title,
        description,
        active,
        scope,
        status,
        owner_user_id,
        allow_self_assignment,
        created_by,
        created_at
      FROM forms
      WHERE id = ?
      `,
      [formId]
    );

    if (!form) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado'
      });
    }

    if (form.status === 'archived') {
      return res.json({
        ok: true,
        message: 'El relevamiento ya estaba archivado',
        form
      });
    }

    await db.run(
      `
      UPDATE forms
      SET status = 'archived'
      WHERE id = ?
      `,
      [formId]
    );

    const archivedForm = await db.get(
      `
      SELECT
        id,
        title,
        description,
        active,
        scope,
        status,
        owner_user_id,
        allow_self_assignment,
        created_by,
        created_at
      FROM forms
      WHERE id = ?
      `,
      [formId]
    );

    return res.json({
      ok: true,
      message: 'Relevamiento archivado correctamente',
      form: archivedForm
    });
  } catch (error) {
    console.error('Error archivando relevamiento:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno al archivar relevamiento'
    });
  }
});

router.get('/dashboard/forms', async (req, res) => {
  try {
    const db = await getDatabase();

    const forms = await db.all(`
      SELECT
        forms.id,
        forms.title,
        forms.description,
        forms.active,
        forms.scope,
        forms.status,
        forms.owner_user_id,
        forms.allow_self_assignment,
        forms.created_at,
        users.name AS created_by_name,
        COUNT(DISTINCT form_fields.id) AS fields_count,
        COUNT(DISTINCT form_assignments.id) AS assignments_count,
        COUNT(DISTINCT submissions.id) AS submissions_count
      FROM forms
      INNER JOIN users ON users.id = forms.created_by
      LEFT JOIN form_fields ON form_fields.form_id = forms.id
      LEFT JOIN form_assignments ON form_assignments.form_id = forms.id
      LEFT JOIN submissions ON submissions.form_id = forms.id
      GROUP BY
        forms.id,
        forms.title,
        forms.description,
        forms.active,
        forms.scope,
        forms.status,
        forms.owner_user_id,
        forms.allow_self_assignment,
        forms.created_at,
        users.name
      ORDER BY forms.id DESC;
    `);

    res.json({
      ok: true,
      forms
    });
  } catch (error) {
    console.error('Error obteniendo dashboard de relevamientos:', error);

    res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/detail', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

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

    if (!form) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado'
      });
    }

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
      ORDER BY field_order ASC, id ASC;
      `,
      [formId]
    );

    const parsedFields = fields.map((field) => ({
      ...field,
      options: field.options ? JSON.parse(field.options) : null,
      required: field.required === 1
    }));

    const assignments = await db.all(
      `
      SELECT
        form_assignments.id,
        form_assignments.form_id,
        form_assignments.user_id,
        users.name AS user_name,
        users.username,
        users.municipality_name,
        form_assignments.assigned_at
      FROM form_assignments
      INNER JOIN users ON users.id = form_assignments.user_id
      WHERE form_assignments.form_id = ?
      ORDER BY users.municipality_name ASC;
      `,
      [formId]
    );

    const totalSubmissionsRow = await db.get(
      `
      SELECT COUNT(*) AS total
      FROM submissions
      WHERE form_id = ?
      `,
      [formId]
    );

    const submissionsByMunicipality = await db.all(
      `
      SELECT
        municipality_name,
        COUNT(*) AS submissions_count
      FROM submissions
      WHERE form_id = ?
      GROUP BY municipality_name
      ORDER BY municipality_name ASC;
      `,
      [formId]
    );

    return res.json({
      ok: true,
      form,
      fields: parsedFields,
      assignments,
      summary: {
        fields_count: parsedFields.length,
        assignments_count: assignments.length,
        submissions_count: totalSubmissionsRow.total || 0,
        submissions_by_municipality: submissionsByMunicipality
      }
    });
  } catch (error) {
    console.error('Error obteniendo detalle de relevamiento:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});
module.exports = router;









