import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  IconButton,
  Loader,
  Main,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  TextInput,
  Tr,
  Typography,
} from "@strapi/design-system";
import { Lock, Plus, Trash } from "@strapi/icons";
import { Layouts } from "@strapi/strapi/admin";

import type { SettingsPayload } from "../../../shared/rbac";
import { api } from "../api/client";

/** Label + control, since Design System v2 dropped the `label` prop from inputs. */
const Labelled = ({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
}) => (
  <Field.Root name={name}>
    <Field.Label>{label}</Field.Label>
    {children}
  </Field.Root>
);

/**
 * Settings: field rules and fact-fields, both editable without a deploy.
 *
 * The two tables are deliberately separate. A role rule answers "who may touch this field
 * at all"; a fact-field answers "when does this field freeze". A field is often freely
 * editable *and* frozen after approval, so folding them together would misrepresent both.
 */
const HomePage = () => {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rule, setRule] = useState({
    role: "",
    uid: "",
    field: "",
    operation: "write" as "read" | "write",
  });
  const [fact, setFact] = useState({ uid: "", field: "", lockedFromStage: "Approved" });

  const reload = async () => {
    try {
      setData(await api.settings());
      setError(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const fieldsFor = useMemo(
    () => (uid: string) => data?.contentTypes.find((type) => type.uid === uid)?.fields ?? [],
    [data]
  );

  if (data === null) {
    return (
      <Main>
        <Box padding={8}>{error ? <Typography textColor="danger600">{error}</Typography> : <Loader>Loading rules</Loader>}</Box>
      </Main>
    );
  }

  const run = async (action: Promise<unknown>) => {
    try {
      await action;
      await reload();
    } catch (actionError) {
      setError((actionError as Error).message);
    }
  };

  return (
    <Main>
      {/*
        Strapi's own header and content layout, not a hand-rolled one: this page now sits in
        Settings alongside Roles and Users, and a page that frames itself differently from
        its neighbours reads as bolted on.
      */}
      <Layouts.Header
        title="Field rules"
        subtitle="Which role may read or write which field, and which fields freeze once an entry is approved. Rules apply on the next request — no restart."
      />

      <Layouts.Content>
        {error ? (
          <Box paddingBottom={4}>
            <Typography textColor="danger600">{error}</Typography>
          </Box>
        ) : null}

        <Box
          background="neutral0"
          padding={5}
          hasRadius
          shadow="tableShadow"
          marginBottom={6}
        >
          <Typography variant="delta" tag="h2">
            Read and write rules
          </Typography>
          <Box paddingTop={2} paddingBottom={4}>
            <Typography variant="pi" textColor="neutral600">
              A field with no matching rule is allowed: the platform starts permissive and is
              tightened rule by rule. An exact field beats a <code>*</code> wildcard.
            </Typography>
          </Box>

          <Flex gap={2} alignItems="flex-end" marginBottom={4} wrap="wrap">
            <Box minWidth="180px">
              <Labelled label="Role" name="rule-role">
                <SingleSelect
                  value={rule.role}
                  placeholder="Pick a role"
                  onChange={(value: string | number) =>
                    setRule((state) => ({ ...state, role: String(value) }))
                  }
                >
                  {data.roles.map((role) => (
                    <SingleSelectOption key={role.id} value={String(role.id)}>
                      {role.name}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Labelled>
            </Box>

            <Box minWidth="220px">
              <Labelled label="Content-type" name="rule-uid">
                <SingleSelect
                  value={rule.uid}
                  placeholder="Pick a content-type"
                  onChange={(value: string | number) =>
                    setRule((state) => ({ ...state, uid: String(value), field: "" }))
                  }
                >
                  {data.contentTypes.map((type) => (
                    <SingleSelectOption key={type.uid} value={type.uid}>
                      {type.displayName}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Labelled>
            </Box>

            <Box minWidth="180px">
              <Labelled label="Field" name="rule-field">
                <SingleSelect
                  value={rule.field}
                  placeholder="Pick a field"
                  onChange={(value: string | number) =>
                    setRule((state) => ({ ...state, field: String(value) }))
                  }
                >
                  <SingleSelectOption value="*">* (all fields)</SingleSelectOption>
                  {fieldsFor(rule.uid).map((field) => (
                    <SingleSelectOption key={field} value={field}>
                      {field}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Labelled>
            </Box>

            <Box minWidth="140px">
              <Labelled label="Operation" name="rule-operation">
                <SingleSelect
                  value={rule.operation}
                  onChange={(value: string | number) =>
                    setRule((state) => ({ ...state, operation: String(value) as "read" | "write" }))
                  }
                >
                  <SingleSelectOption value="write">write</SingleSelectOption>
                  <SingleSelectOption value="read">read</SingleSelectOption>
                </SingleSelect>
              </Labelled>
            </Box>

            <Button
              startIcon={<Plus />}
              variant="danger-light"
              disabled={!rule.role || !rule.uid || !rule.field}
              onClick={() =>
                run(
                  api.createRule({
                    role: Number(rule.role),
                    uid: rule.uid,
                    field: rule.field,
                    operation: rule.operation,
                    allow: false,
                  })
                ).then(() => setRule((state) => ({ ...state, field: "" })))
              }
            >
              Deny
            </Button>
          </Flex>

          {data.rules.length === 0 ? (
            <Typography textColor="neutral600">
              No rules yet — every role may write every field.
            </Typography>
          ) : (
            <Table colCount={5} rowCount={data.rules.length + 1}>
              <Thead>
                <Tr>
                  {["Role", "Content-type", "Field", "Operation", ""].map((label) => (
                    <Th key={label}>
                      <Typography variant="sigma">{label}</Typography>
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {data.rules.map((item) => (
                  <Tr key={item.documentId}>
                    <Td>
                      <Typography>{item.roleName}</Typography>
                    </Td>
                    <Td>
                      <Typography textColor="neutral600">{item.uid}</Typography>
                    </Td>
                    <Td>
                      <Typography fontWeight="bold">{item.field}</Typography>
                    </Td>
                    <Td>
                      <Badge textColor={item.allow ? "success600" : "danger600"}>
                        {item.allow ? "allow" : "deny"} {item.operation}
                      </Badge>
                    </Td>
                    <Td>
                      <IconButton
                        label="Delete rule"
                        variant="danger-light"
                        onClick={() => run(api.deleteRule(item.documentId))}
                      >
                        <Trash />
                      </IconButton>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>

        <Box background="neutral0" padding={5} hasRadius shadow="tableShadow">
          <Flex gap={2} alignItems="center">
            <Lock />
            <Typography variant="delta" tag="h2">
              Fact-fields
            </Typography>
          </Flex>
          <Box paddingTop={2} paddingBottom={4}>
            <Typography variant="pi" textColor="neutral600">
              Frozen once the entry reaches the stage below. Only the{" "}
              <strong>{data.contentAuthorityRole}</strong> role may change them afterwards.
            </Typography>
          </Box>

          <Flex gap={2} alignItems="flex-end" marginBottom={4} wrap="wrap">
            <Box minWidth="220px">
              <Labelled label="Content-type" name="fact-uid">
                <SingleSelect
                  value={fact.uid}
                  placeholder="Pick a content-type"
                  onChange={(value: string | number) =>
                    setFact((state) => ({ ...state, uid: String(value), field: "" }))
                  }
                >
                  {data.contentTypes.map((type) => (
                    <SingleSelectOption key={type.uid} value={type.uid}>
                      {type.displayName}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Labelled>
            </Box>

            <Box minWidth="180px">
              <Labelled label="Field" name="fact-field">
                <SingleSelect
                  value={fact.field}
                  placeholder="Pick a field"
                  onChange={(value: string | number) =>
                    setFact((state) => ({ ...state, field: String(value) }))
                  }
                >
                  {fieldsFor(fact.uid).map((field) => (
                    <SingleSelectOption key={field} value={field}>
                      {field}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Labelled>
            </Box>

            <Box minWidth="160px">
              <Labelled label="Locks at stage" name="fact-stage">
                <TextInput
                  name="fact-stage"
                  value={fact.lockedFromStage}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setFact((state) => ({ ...state, lockedFromStage: event.target.value }))
                  }
                />
              </Labelled>
            </Box>

            <Button
              startIcon={<Plus />}
              disabled={!fact.uid || !fact.field || !fact.lockedFromStage.trim()}
              onClick={() =>
                run(api.createFactField(fact)).then(() =>
                  setFact((state) => ({ ...state, field: "" }))
                )
              }
            >
              Lock field
            </Button>
          </Flex>

          {data.factFields.length === 0 ? (
            <Typography textColor="neutral600">No fact-fields configured.</Typography>
          ) : (
            <Table colCount={4} rowCount={data.factFields.length + 1}>
              <Thead>
                <Tr>
                  {["Content-type", "Field", "Locks at stage", ""].map((label) => (
                    <Th key={label}>
                      <Typography variant="sigma">{label}</Typography>
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {data.factFields.map((item) => (
                  <Tr key={item.documentId}>
                    <Td>
                      <Typography textColor="neutral600">{item.uid}</Typography>
                    </Td>
                    <Td>
                      <Typography fontWeight="bold">{item.field}</Typography>
                    </Td>
                    <Td>
                      <Badge>{item.lockedFromStage}</Badge>
                    </Td>
                    <Td>
                      <IconButton
                        label="Remove lock"
                        variant="danger-light"
                        onClick={() => run(api.deleteFactField(item.documentId))}
                      >
                        <Trash />
                      </IconButton>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>
      </Layouts.Content>
    </Main>
  );
};

export { HomePage };
