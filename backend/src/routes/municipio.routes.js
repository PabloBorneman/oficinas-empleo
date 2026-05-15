const express = require('express');

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
router.use(requireRole('municipio'));

function parseOptions(options) {
  return options ? JSON.parse(options) : null;
}

function isEmptyValue(value) {
  if (value === false) return false;
  if (value === 0) return false;
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function normalizeValue(field, value) {
  if (field.type === 'multiselect') {
    return JSON.stringify(value);
  }

  if (field.type === 'boolean') {
    return value === true || value === 'true' || value === 1 || value === '1'
      ? 'true'
      : 'false';
  }

  if (field.type === 'number') {
    return String(Number(value));
  }

  return String(value);
}

function validateFieldValue(field, value) {
  const options = parseOptions(field.options);

  if (field.required === 1 && isEmptyValue(value)) {
    return `El campo "${field.label}" es obligatorio`;
  }

  if (isEmptyValue(value)) {
    return null;
  }

  if (field.type === 'number' && Number.isNaN(Number(value))) {
    return `El campo "${field.label}" debe ser numerico`;
  }

  if (field.type === 'select') {
    if (!options.includes(value)) {
      return `El valor del campo "${field.label}" no es una opcion valida`;
    }
  }

  if (field.type === 'multiselect') {
    if (!Array.isArray(value)) {
      return `El campo "${field.label}" debe ser un array`;
    }

    const invalidOption = value.find((item) => !options.includes(item));

    if (invalidOption) {
      return `El valor "${invalidOption}" no es una opcion valida para "${field.label}"`;
    }
  }

  return null;
}

router.get('/me', async (req, res) => {
  const db = await getDatabase();

  const user = await db.get(
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
    [req.user.id]
  );

  res.json({
    ok: true,
    message: 'Ruta municipio protegida funcionando',
    user
  });
});

router.get('/forms', async (req, res) => {
  const db = await getDatabase();

  const forms = await db.all(
    `
    SELECT
      forms.id,
      forms.title,
      forms.description,
      forms.active,
      forms.created_at,
      form_assignments.assigned_at
    FROM form_assignments
    INNER JOIN forms ON forms.id = form_assignments.form_id
    WHERE form_assignments.user_id = ?
      AND forms.active = 1
    ORDER BY forms.created_at DESC;
    `,
    [req.user.id]
  );

  res.json({
    ok: true,
    municipality_name: req.user.municipality_name,
    forms
  });
});

router.get('/forms/:formId', async (req, res) => {
  const formId = Number(req.params.formId);

  if (!formId) {
    return res.status(400).json({
      ok: false,
      message: 'formId invalido'
    });
  }

  const db = await getDatabase();

  const assignedForm = await db.get(
    `
    SELECT
      forms.id,
      forms.title,
      forms.description,
      forms.active,
      forms.scope,
      forms.status,
      forms.owner_user_id,
      forms.created_by,
      forms.created_at,
      form_assignments.assigned_at,
      CASE
        WHEN forms.scope = 'local' AND forms.owner_user_id = ? THEN 1
        ELSE 0
      END AS can_edit_fields
    FROM form_assignments
    INNER JOIN forms ON forms.id = form_assignments.form_id
    WHERE form_assignments.user_id = ?
      AND forms.id = ?
      AND forms.active = 1
    `,
    [req.user.id, req.user.id, formId]
  );

  if (!assignedForm) {
    return res.status(404).json({
      ok: false,
      message: 'Relevamiento no encontrado o no asignado a este municipio'
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
    municipality_name: req.user.municipality_name,
    form: assignedForm,
    fields: parsedFields
  });
});

router.post('/forms/:formId/submissions', async (req, res) => {
  try {
    const formId = Number(req.params.formId);
    const { values } = req.body;

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    if (!Array.isArray(values) || values.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'values debe ser un array con las respuestas'
      });
    }

    const db = await getDatabase();

    const assignedForm = await db.get(
      `
      SELECT forms.id
      FROM form_assignments
      INNER JOIN forms ON forms.id = form_assignments.form_id
      WHERE form_assignments.user_id = ?
        AND forms.id = ?
        AND forms.active = 1
      `,
      [req.user.id, formId]
    );

    if (!assignedForm) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado o no asignado a este municipio'
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
        field_order
      FROM form_fields
      WHERE form_id = ?
      ORDER BY field_order ASC, id ASC;
      `,
      [formId]
    );

    const valuesByFieldId = new Map();

    for (const item of values) {
      valuesByFieldId.set(Number(item.field_id), item.value);
    }

    for (const field of fields) {
      const value = valuesByFieldId.get(field.id);
      const error = validateFieldValue(field, value);

      if (error) {
        return res.status(400).json({
          ok: false,
          message: error
        });
      }
    }

    await db.exec('BEGIN TRANSACTION;');

    const submissionResult = await db.run(
      `
      INSERT INTO submissions (
        form_id,
        user_id,
        municipality_name
      )
      VALUES (?, ?, ?)
      `,
      [
        formId,
        req.user.id,
        req.user.municipality_name
      ]
    );

    const submissionId = submissionResult.lastID;

    for (const field of fields) {
      const value = valuesByFieldId.get(field.id);

      if (!isEmptyValue(value)) {
        await db.run(
          `
          INSERT INTO submission_values (
            submission_id,
            field_id,
            value
          )
          VALUES (?, ?, ?)
          `,
          [
            submissionId,
            field.id,
            normalizeValue(field, value)
          ]
        );
      }
    }

    await db.exec('COMMIT;');

    const submission = await db.get(
      `
      SELECT
        id,
        form_id,
        user_id,
        municipality_name,
        created_at,
        updated_at
      FROM submissions
      WHERE id = ?
      `,
      [submissionId]
    );

    return res.status(201).json({
      ok: true,
      message: 'Respuesta cargada correctamente',
      submission
    });
  } catch (error) {
    console.error('Error cargando respuesta:', error);

    try {
      const db = await getDatabase();
      await db.exec('ROLLBACK;');
    } catch (_) {}

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/submissions', async (req, res) => {
  const formId = Number(req.params.formId);

  if (!formId) {
    return res.status(400).json({
      ok: false,
      message: 'formId invalido'
    });
  }

  const db = await getDatabase();

  const submissions = await db.all(
    `
    SELECT
      id,
      form_id,
      user_id,
      municipality_name,
      created_at,
      updated_at
    FROM submissions
    WHERE form_id = ?
      AND user_id = ?
    ORDER BY id DESC
    `,
    [formId, req.user.id]
  );

  res.json({
    ok: true,
    municipality_name: req.user.municipality_name,
    submissions
  });
});



router.get('/available-forms', async (req, res) => {
  try {
    const db = await getDatabase();

    const forms = await db.all(
      `
      SELECT
        forms.id,
        forms.title,
        forms.description,
        forms.scope,
        forms.status,
        forms.active,
        forms.allow_self_assignment,
        forms.created_at,
        forms.owner_user_id,
        users.name AS created_by_name,
        users.municipality_name AS created_by_municipality,
        COUNT(DISTINCT form_fields.id) AS fields_count,
        CASE
          WHEN form_assignments.id IS NULL THEN 0
          ELSE 1
        END AS already_assigned,
        COUNT(DISTINCT submissions.id) AS my_submissions_count
      FROM forms
      LEFT JOIN users ON users.id = forms.created_by
      LEFT JOIN form_fields ON form_fields.form_id = forms.id
      LEFT JOIN form_assignments
        ON form_assignments.form_id = forms.id
        AND form_assignments.user_id = ?
      LEFT JOIN submissions
        ON submissions.form_id = forms.id
        AND submissions.user_id = ?
      WHERE (
          forms.scope = 'official'
          OR (
            forms.scope = 'local'
            AND forms.owner_user_id IS NOT NULL
            AND forms.owner_user_id <> ?
          )
        )
        AND forms.status = 'active'
        AND forms.active = 1
        AND forms.allow_self_assignment = 1
      GROUP BY
        forms.id,
        forms.title,
        forms.description,
        forms.scope,
        forms.status,
        forms.active,
        forms.allow_self_assignment,
        forms.created_at,
        forms.owner_user_id,
        users.name,
        users.municipality_name,
        form_assignments.id
      ORDER BY forms.title ASC;
      `,
      [req.user.id, req.user.id, req.user.id]
    );

    const normalizedForms = forms.map((form) => ({
      ...form,
      already_assigned: form.already_assigned === 1
    }));

    return res.json({
      ok: true,
      municipality_name: req.user.municipality_name,
      forms: normalizedForms
    });
  } catch (error) {
    console.error('Error listando relevamientos disponibles:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno al listar relevamientos disponibles'
    });
  }
});


router.post('/forms/:formId/use', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'ID de relevamiento invalido'
      });
    }

    const db = await getDatabase();

    const form = await db.get(
      `
      SELECT
        id,
        title,
        description,
        scope,
        status,
        active,
        allow_self_assignment,
        owner_user_id
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

    const canUseOfficial =
      form.scope === 'official' &&
      form.status === 'active' &&
      form.active === 1 &&
      form.allow_self_assignment === 1;

    const canUseSharedLocal =
      form.scope === 'local' &&
      form.status === 'active' &&
      form.active === 1 &&
      form.allow_self_assignment === 1 &&
      form.owner_user_id !== req.user.id;

    if (!canUseOfficial && !canUseSharedLocal) {
      return res.status(403).json({
        ok: false,
        message: 'Este relevamiento no esta disponible para uso automatico por municipios'
      });
    }

    const existingAssignment = await db.get(
      `
      SELECT
        id,
        form_id,
        user_id,
        assigned_at
      FROM form_assignments
      WHERE form_id = ?
        AND user_id = ?
      `,
      [formId, req.user.id]
    );

    if (existingAssignment) {
      return res.json({
        ok: true,
        message: 'El relevamiento ya estaba asignado a tu municipio',
        assignment: existingAssignment
      });
    }

    const result = await db.run(
      `
      INSERT INTO form_assignments (
        form_id,
        user_id
      )
      VALUES (?, ?)
      `,
      [formId, req.user.id]
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
      WHERE form_assignments.id = ?
      `,
      [result.lastID]
    );

    return res.status(201).json({
      ok: true,
      message: 'Relevamiento asignado correctamente a tu municipio',
      assignment
    });
  } catch (error) {
    console.error('Error usando relevamiento disponible:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno al usar relevamiento disponible'
    });
  }
});


router.post('/forms', async (req, res) => {
  const db = await getDatabase();

  try {
    const {
      title,
      description
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        ok: false,
        message: 'El titulo del relevamiento es obligatorio'
      });
    }

    await db.exec('BEGIN;');

    const result = await db.run(
      `
      INSERT INTO forms (
        title,
        description,
        active,
        created_by,
        scope,
        status,
        owner_user_id,
        allow_self_assignment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        String(title).trim(),
        description || null,
        1,
        req.user.id,
        'local',
        'active',
        req.user.id,
        1
      ]
    );

    const formId = result.lastID;

    await db.run(
      `
      INSERT INTO form_assignments (
        form_id,
        user_id
      )
      VALUES (?, ?)
      `,
      [formId, req.user.id]
    );

    await db.exec('COMMIT;');

    const createdForm = await db.get(
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

    return res.status(201).json({
      ok: true,
      message: 'Relevamiento local creado correctamente',
      form: createdForm
    });
  } catch (error) {
    try {
      await db.exec('ROLLBACK;');
    } catch (_) {}

    console.error('Error creando relevamiento local:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno al crear relevamiento local'
    });
  }
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
      `
      SELECT
        id,
        title,
        scope,
        owner_user_id
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

    if (form.scope !== 'local' || form.owner_user_id !== req.user.id) {
      return res.status(403).json({
        ok: false,
        message: 'Solo podes agregar campos a relevamientos locales propios'
      });
    }

    const existingSubmissions = await db.get(
      `
      SELECT COUNT(*) AS total
      FROM submissions
      WHERE form_id = ?
      `,
      [formId]
    );

    if (existingSubmissions.total > 0) {
      return res.status(409).json({
        ok: false,
        message: 'No se pueden agregar campos porque el relevamiento ya tiene respuestas cargadas'
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
      message: 'Campo local agregado correctamente',
      field: {
        ...createdField,
        options: createdField.options ? JSON.parse(createdField.options) : null,
        required: createdField.required === 1
      }
    });
  } catch (error) {
    console.error('Error creando campo local:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/submissions/detail', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    const db = await getDatabase();

    const assignedForm = await db.get(
      `
      SELECT
        forms.id,
        forms.title,
        forms.description,
        forms.scope,
        forms.status,
        forms.active
      FROM form_assignments
      INNER JOIN forms ON forms.id = form_assignments.form_id
      WHERE form_assignments.user_id = ?
        AND forms.id = ?
        AND forms.active = 1
      `,
      [req.user.id, formId]
    );

    if (!assignedForm) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado o no asignado a este municipio'
      });
    }

    const submissions = await db.all(
      `
      SELECT
        id,
        form_id,
        user_id,
        municipality_name,
        created_at,
        updated_at
      FROM submissions
      WHERE form_id = ?
        AND user_id = ?
      ORDER BY id DESC;
      `,
      [formId, req.user.id]
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
      municipality_name: req.user.municipality_name,
      form: assignedForm,
      submissions: submissionsWithValues
    });
  } catch (error) {
    console.error('Error listando respuestas detalladas del municipio:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/forms/:formId/submissions/detail', async (req, res) => {
  try {
    const formId = Number(req.params.formId);

    if (!formId) {
      return res.status(400).json({
        ok: false,
        message: 'formId invalido'
      });
    }

    const db = await getDatabase();

    const assignedForm = await db.get(
      `
      SELECT
        forms.id,
        forms.title,
        forms.description,
        forms.scope,
        forms.status,
        forms.active
      FROM form_assignments
      INNER JOIN forms ON forms.id = form_assignments.form_id
      WHERE form_assignments.user_id = ?
        AND forms.id = ?
        AND forms.active = 1
      `,
      [req.user.id, formId]
    );

    if (!assignedForm) {
      return res.status(404).json({
        ok: false,
        message: 'Relevamiento no encontrado o no asignado a este municipio'
      });
    }

    const submissions = await db.all(
      `
      SELECT
        id,
        form_id,
        user_id,
        municipality_name,
        created_at,
        updated_at
      FROM submissions
      WHERE form_id = ?
        AND user_id = ?
      ORDER BY id DESC;
      `,
      [formId, req.user.id]
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
      municipality_name: req.user.municipality_name,
      form: assignedForm,
      submissions: submissionsWithValues
    });
  } catch (error) {
    console.error('Error listando respuestas detalladas del municipio:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});
module.exports = router;






