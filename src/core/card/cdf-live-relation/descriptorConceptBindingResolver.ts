import type {
  CdfConceptBinding,
  CdfConceptResolution,
  CdfLiveRelationIssue,
} from './types';

export interface CdfDescriptorConceptBindingResolverInput {
  sourceBlockId: string;
  inlineConcepts?: CdfConceptResolution | null;
  listParentConcepts?: CdfConceptResolution | null;
  listBacklinkConcepts?: CdfConceptResolution | null;
  bodyHeadingConcept?: CdfConceptBinding | null;
  bodyDocumentConcept?: CdfConceptBinding | null;
  allowBodyContext: boolean;
}

interface EvidenceGroup {
  resolution: CdfConceptResolution;
}

function hasBindings(group: EvidenceGroup): boolean {
  return group.resolution.bindings.length > 0;
}

function conceptSet(group: EvidenceGroup): string {
  return group.resolution.bindings
    .map(binding => binding.conceptBlockId)
    .sort()
    .join(',');
}

function sameConceptSet(left: EvidenceGroup, right: EvidenceGroup): boolean {
  return conceptSet(left) === conceptSet(right);
}

function uniqueIssues(groups: EvidenceGroup[]): CdfLiveRelationIssue[] {
  return groups.flatMap(group => group.resolution.issues);
}

function singleBindingResolution(binding: CdfConceptBinding | null | undefined): CdfConceptResolution | null {
  if (!binding) {
    return null;
  }
  return {
    bindings: [binding],
    issues: [],
  };
}

export function resolveCdfDescriptorConceptBinding(
  input: CdfDescriptorConceptBindingResolverInput,
): CdfConceptResolution {
  const explicitGroups: EvidenceGroup[] = [
    input.inlineConcepts ? { resolution: input.inlineConcepts } : null,
    input.listBacklinkConcepts ? { resolution: input.listBacklinkConcepts } : null,
    input.listParentConcepts ? { resolution: input.listParentConcepts } : null,
  ].filter((group): group is EvidenceGroup => Boolean(group));
  const explicitIssues = uniqueIssues(explicitGroups);
  const validExplicitGroups = explicitGroups.filter(hasBindings);

  if (validExplicitGroups.length > 1) {
    const [firstGroup, ...restGroups] = validExplicitGroups;
    if (restGroups.some(group => !sameConceptSet(firstGroup, group))) {
      return {
        bindings: [],
        issues: [
          ...explicitIssues,
          {
            code: 'descriptor-concept-conflict',
            severity: 'blocking',
            sourceBlockId: input.sourceBlockId,
            detail: validExplicitGroups
              .map(group => conceptSet(group))
              .filter(Boolean)
              .join('|'),
          },
        ],
      };
    }
  }

  if (validExplicitGroups.length > 0) {
    return {
      bindings: validExplicitGroups[0].resolution.bindings,
      issues: explicitIssues,
    };
  }

  if (explicitIssues.some(issue => issue.severity === 'blocking')) {
    return {
      bindings: [],
      issues: explicitIssues,
    };
  }

  if (!input.allowBodyContext) {
    return {
      bindings: [],
      issues: explicitIssues,
    };
  }

  const bodyHeading = singleBindingResolution(input.bodyHeadingConcept);
  if (bodyHeading) {
    return bodyHeading;
  }

  const bodyDocument = singleBindingResolution(input.bodyDocumentConcept);
  if (bodyDocument) {
    return bodyDocument;
  }

  return {
    bindings: [],
    issues: explicitIssues,
  };
}
