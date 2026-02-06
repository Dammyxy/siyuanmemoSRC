/**
 * Type Checker
 * 类型检查器
 *
 * 检查方法返回类型和参数类型的一致性。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 4.2
 */

import * as ts from 'typescript';

export interface SignatureCheckResult {
    returnTypeMatches: boolean;
    parameterTypesMatch: boolean;
    returnTypeText?: string;
    expectedReturnTypeText?: string;
}

export class TypeChecker {
    constructor(private readonly checker: ts.TypeChecker) {}

    checkMethodSignature(
        classType: ts.Type,
        interfaceType: ts.Type,
        methodName: string
    ): SignatureCheckResult {
        const classProp = this.checker.getPropertyOfType(classType, methodName);
        const interfaceProp = this.checker.getPropertyOfType(interfaceType, methodName);

        if (!classProp || !interfaceProp) {
            return { returnTypeMatches: false, parameterTypesMatch: false };
        }

        const classTypeOfProp = this.checker.getTypeOfSymbolAtLocation(
            classProp,
            classProp.valueDeclaration ?? classProp.declarations?.[0]
        );
        const interfaceTypeOfProp = this.checker.getTypeOfSymbolAtLocation(
            interfaceProp,
            interfaceProp.valueDeclaration ?? interfaceProp.declarations?.[0]
        );

        const classSig = classTypeOfProp.getCallSignatures()[0];
        const interfaceSig = interfaceTypeOfProp.getCallSignatures()[0];

        if (!classSig || !interfaceSig) {
            return { returnTypeMatches: false, parameterTypesMatch: false };
        }

        const classReturnType = this.checker.getReturnTypeOfSignature(classSig);
        const interfaceReturnType = this.checker.getReturnTypeOfSignature(interfaceSig);

        const returnTypeMatches = this.checker.isTypeAssignableTo(classReturnType, interfaceReturnType);

        const classParams = classSig.getParameters();
        const interfaceParams = interfaceSig.getParameters();

        if (classParams.length !== interfaceParams.length) {
            return {
                returnTypeMatches,
                parameterTypesMatch: false,
                returnTypeText: this.checker.typeToString(classReturnType),
                expectedReturnTypeText: this.checker.typeToString(interfaceReturnType),
            };
        }

        let parameterTypesMatch = true;
        for (let i = 0; i < classParams.length; i++) {
            const classParamType = this.checker.getTypeOfSymbolAtLocation(
                classParams[i],
                classParams[i].valueDeclaration ?? classParams[i].declarations?.[0]
            );
            const interfaceParamType = this.checker.getTypeOfSymbolAtLocation(
                interfaceParams[i],
                interfaceParams[i].valueDeclaration ?? interfaceParams[i].declarations?.[0]
            );

            if (!this.checker.isTypeAssignableTo(interfaceParamType, classParamType)) {
                parameterTypesMatch = false;
                break;
            }
        }

        return {
            returnTypeMatches,
            parameterTypesMatch,
            returnTypeText: this.checker.typeToString(classReturnType),
            expectedReturnTypeText: this.checker.typeToString(interfaceReturnType),
        };
    }
}
