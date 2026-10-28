import type { UmlDiagramType } from '../types';

export interface PlantUmlFixture {
	type: UmlDiagramType;
	title: string;
	sourceCode: string;
	expectedDefiningConstructs: string[];
}

export const PLANTUML_REPRESENTATIVE_FIXTURES: Record<UmlDiagramType, PlantUmlFixture> = {
	class: {
		type: 'class',
		title: 'Clinical Exchange Domain Model',
		sourceCode: `@startuml
title Clinical Exchange Domain Model
class "ImmunizationEncounter" as ImmunizationEncounter <<entity>> {
  +encounterId : UUID
  +facilityCode : String
  +validatePayload()
}
class "PatientRecord" as PatientRecord <<entity>> {
  +nationalHealthId : String
  +birthDate : Date
  +resolveIdentity()
}
class "InteroperabilityLayer" as InteroperabilityLayer <<service>> {
  +routeBundle()
  +auditTransaction()
}
ImmunizationEncounter "0..*" --> "1" PatientRecord : references subject
InteroperabilityLayer *-- ImmunizationEncounter : routes bundle
@enduml`,
		expectedDefiningConstructs: ['uml-classifier', 'ImmunizationEncounter', 'PatientRecord']
	},
	object: {
		type: 'object',
		title: 'Point-in-Time Encounter Snapshot',
		sourceCode: `@startuml
title Point-in-Time Encounter Snapshot
object "enc_402 : ImmunizationEncounter" as enc_402 {
  facilityCode = "PHC-KOL-19"
  vaccineDose = "MR-Dose-1"
  status = "Dispatched"
}
object "pt_981 : PatientRecord" as pt_981 {
  nationalHealthId = "HID-8841-22"
  registryMatch = "Verified"
}
enc_402 --> pt_981 : subjectOfEncounter
@enduml`,
		expectedDefiningConstructs: ['uml-classifier', 'text-decoration="underline"', 'PHC-KOL-19']
	},
	package: {
		type: 'package',
		title: 'Health Exchange Namespace Organization',
		sourceCode: `@startuml
title Health Exchange Namespace Organization
package "PointOfCareDomain" as PointOfCareDomain {
  class "ClinicCaptureApp" as ClinicCaptureApp
  class "OfflineQueue" as OfflineQueue
}
package "MediationDomain" as MediationDomain {
  class "OpenHIMCore" as OpenHIMCore
  class "TerminologyMediator" as TerminologyMediator
}
package "RegistryDomain" as RegistryDomain {
  class "ClientRegistry" as ClientRegistry
  class "FacilityRegistry" as FacilityRegistry
}
PointOfCareDomain ..> MediationDomain : <<use>>
MediationDomain ..> RegistryDomain : <<import>>
@enduml`,
		expectedDefiningConstructs: ['uml-package', 'PointOfCareDomain', 'MediationDomain']
	},
	component: {
		type: 'component',
		title: 'Registry Mediation Components & Contracts',
		sourceCode: `@startuml
title Registry Mediation Components & Contracts
component "ClinicCaptureClient" as ClinicCaptureClient <<subsystem>>
component "InteroperabilityMediator" as InteroperabilityMediator <<mediator>>
component "MasterPatientIndex" as MasterPatientIndex <<registry>>
() "FHIRBundleAPI" as FHIRBundleAPI
() "PIXmIdentityLookup" as PIXmIdentityLookup
ClinicCaptureClient ..> FHIRBundleAPI : <<use>>
InteroperabilityMediator --() FHIRBundleAPI : provides
InteroperabilityMediator ..> PIXmIdentityLookup : <<use>>
MasterPatientIndex --() PIXmIdentityLookup : provides
@enduml`,
		expectedDefiningConstructs: ['uml-component', 'uml-interface', 'FHIRBundleAPI']
	},
	'composite-structure': {
		type: 'composite-structure',
		title: 'Interoperability Mediator Internal Structure',
		sourceCode: `@startuml
title Interoperability Mediator Internal Structure
component "InteroperabilityMediator" as InteroperabilityMediator <<composite>> {
  portin "fhirIngressPort" as fhirIngressPort
  portout "registryEgressPort" as registryEgressPort
  component "authGuard : mTLSValidator [1]" as authGuard <<part>>
  component "orchestrator : RouteEngine [1]" as orchestrator <<part>>
  component "terminologyMap : ICD11Adapter [1..*]" as terminologyMap <<part>>
}
fhirIngressPort --> authGuard : <<delegation>> verify cert
authGuard --> orchestrator : <<assembly>> verified bundle
orchestrator --> terminologyMap : <<assembly>> normalize codes
terminologyMap --> registryEgressPort : <<delegation>> dispatch
@enduml`,
		expectedDefiningConstructs: ['uml-composite-frame', 'uml-port', 'uml-internal-part']
	},
	deployment: {
		type: 'deployment',
		title: 'Regional Clinic to National Exchange Topology',
		sourceCode: `@startuml
title Regional Clinic to National Exchange Topology
node "RuralClinicTablet" as RuralClinicTablet <<device>> {
  artifact "immunization-capture.apk" as apk
  artifact "local-sqlite-queue.db" as queue
}
node "NationalExchangeGateway" as NationalExchangeGateway <<executionEnvironment>> {
  artifact "openhim-core.jar" as openhim
  artifact "fhir-mediator.js" as mediator
}
database "SharedHealthRecordStore" as SharedHealthRecordStore <<database>> {
  artifact "shr-fhir-store.pg" as shr
}
RuralClinicTablet --> NationalExchangeGateway : <<mTLS / HTTPS>>
NationalExchangeGateway --> SharedHealthRecordStore : <<FHIR R4 REST>>
@enduml`,
		expectedDefiningConstructs: [
			'uml-deployment-node',
			'RuralClinicTablet',
			'NationalExchangeGateway'
		]
	},
	profile: {
		type: 'profile',
		title: 'Health Interoperability Governance Profile',
		sourceCode: `@startuml
title Health Interoperability Governance Profile
package "HealthExchangeProfile" as HealthExchangeProfile <<profile>> {
  class "Class" as MetaClass <<metaclass>>
  class "Component" as MetaComponent <<metaclass>>
  class "AuditableResource" as AuditableResource <<stereotype>> {
    +retentionYears : Integer = 7
    +consentScope : String
  }
  class "VerifiedMediator" as VerifiedMediator <<stereotype>> {
    +mTLSRequired : Boolean = true
    +terminologyVersion : String
  }
}
AuditableResource -up->> MetaClass : <<extension>>
VerifiedMediator -up->> MetaComponent : <<extension>>
note "All AuditableResource instances must record an immutable provenance hash." as N1
@enduml`,
		expectedDefiningConstructs: [
			'uml-profile-container',
			'marker-end="url(#uml-extension)"',
			'AuditableResource'
		]
	},
	'use-case': {
		type: 'use-case',
		title: 'Immunization Reporting Actor Goals',
		sourceCode: `@startuml
title Immunization Reporting Actor Goals
actor "AuxiliaryNurseMidwife" as AuxiliaryNurseMidwife
actor "DistrictHealthOfficer" as DistrictHealthOfficer
rectangle "ImmunizationExchangeBoundary" as ImmunizationExchangeBoundary {
  usecase "Submit Immunization Encounter" as UC1
  usecase "Verify Patient National ID" as UC2
  usecase "Audit Coverage Discrepancies" as UC3
}
AuxiliaryNurseMidwife --> UC1
UC1 ..> UC2 : <<include>>
DistrictHealthOfficer --> UC3
@enduml`,
		expectedDefiningConstructs: ['uml-system-boundary', 'uml-actor', 'uml-usecase']
	},
	activity: {
		type: 'activity',
		title: 'Encounter Validation and Routing Workflow',
		sourceCode: `@startuml
title Encounter Validation and Routing Workflow
|Clinic Tablet|
start
:Capture immunization dose and patient token;
|Interoperability Layer|
:Validate mTLS certificate and FHIR schema;
if (Patient identity matched in Registry?) then (yes)
  fork
    :Persist encounter in Shared Health Record;
  fork again
    :Update District Immunization Tally;
  end fork
else (no)
  :Queue encounter for manual demographic reconciliation;
endif
:Return signed receipt to clinic;
stop
@enduml`,
		expectedDefiningConstructs: ['uml-action-node', 'uml-decision', 'Persist encounter']
	},
	'state-machine': {
		type: 'state-machine',
		title: 'Clinical Encounter Submission Lifecycle',
		sourceCode: `@startuml
title Clinical Encounter Submission Lifecycle
[*] --> DraftQueued : nurse saves form
state "DraftQueued" as DraftQueued : entry / write to encrypted local queue
state "InMediation" as InMediation : do / verify terminology & identity
state "CommittedToSHR" as CommittedToSHR : entry / issue immutable receipt
state "Quarantined" as Quarantined : entry / flag demographic mismatch
DraftQueued --> InMediation : networkConnected [mTLSValid] / transmitBundle
InMediation --> CommittedToSHR : registryResolved [schemaValid] / commitRecord
InMediation --> Quarantined : identityAmbiguous / notifySupervisor
CommittedToSHR --> [*]
@enduml`,
		expectedDefiningConstructs: ['uml-state', 'DraftQueued', 'CommittedToSHR']
	},
	sequence: {
		type: 'sequence',
		title: 'Chronological Encounter Mediation Sequence',
		sourceCode: `@startuml
title Chronological Encounter Mediation Sequence
participant "ClinicTablet" as ClinicTablet
participant "OpenHIMMediator" as OpenHIMMediator
participant "ClientRegistry" as ClientRegistry
participant "SharedHealthRecord" as SharedHealthRecord
ClinicTablet -> OpenHIMMediator : POST /fhir/Bundle (Encounter)
OpenHIMMediator -> ClientRegistry : GET /Patient?identifier=HID
ClientRegistry --> OpenHIMMediator : 200 OK (Matched Patient CRID)
OpenHIMMediator -> SharedHealthRecord : PUT /Encounter (Normalized Bundle)
SharedHealthRecord --> OpenHIMMediator : 201 Created (Provenance Receipt)
OpenHIMMediator --> ClinicTablet : 200 OK (Dispatch Confirmed)
@enduml`,
		expectedDefiningConstructs: ['uml-lifeline', 'uml-seq-message', 'OpenHIMMediator']
	},
	communication: {
		type: 'communication',
		title: 'Participant Link Network & Numbered Messages',
		sourceCode: `@startuml
title Participant Link Network & Numbered Messages
agent ":ClinicTablet" as ClinicTablet
agent ":OpenHIMMediator" as OpenHIMMediator
agent ":ClientRegistry" as ClientRegistry
agent ":SharedHealthRecord" as SharedHealthRecord
ClinicTablet --> OpenHIMMediator : 1: submitEncounterBundle()
OpenHIMMediator --> ClientRegistry : 1.1: resolvePatientCRID()
OpenHIMMediator --> SharedHealthRecord : 1.2: storeVerifiedEncounter()
OpenHIMMediator --> ClinicTablet : 2: returnAuditReceipt()
@enduml`,
		expectedDefiningConstructs: [
			'uml-comm-participant',
			'uml-comm-link',
			'1.1: resolvePatientCRID()'
		]
	},
	'interaction-overview': {
		type: 'interaction-overview',
		title: 'End-to-End Exchange Interaction Overview',
		sourceCode: `@startuml
title End-to-End Exchange Interaction Overview
start
partition "ref: MutualTLSHandshake" <<ref>> {
  :ClinicTablet <-> OpenHIMMediator : verify X.509 client certificate;
}
partition "sd: IdentityAndTerminologyCheck" <<sd>> {
  :OpenHIMMediator -> ClientRegistry : PIXm demographic query;
  :OpenHIMMediator -> TerminologyService : validate ICD/CVX code;
}
if (Identity and codes verified?) then (verified)
  partition "ref: CommitToSharedHealthRecord" <<ref>> {
    :OpenHIMMediator -> SharedHealthRecord : persist FHIR Bundle;
  }
else (quarantined)
  partition "ref: ExceptionReconciliationFlow" <<ref>> {
    :OpenHIMMediator -> SupervisorQueue : enqueue manual review;
  }
endif
stop
@enduml`,
		expectedDefiningConstructs: [
			'uml-interaction-use-frame',
			'MutualTLSHandshake',
			'IdentityAndTerminologyCheck'
		]
	},
	timing: {
		type: 'timing',
		title: 'Encounter Dispatch & Registry SLA Timeline',
		sourceCode: `@startuml
title Encounter Dispatch & Registry SLA Timeline
robust "ClinicTablet" as ClinicTablet
concise "OpenHIMMediator" as OpenHIMMediator
@0
ClinicTablet is QueuedOffline
OpenHIMMediator is Idle
@5
ClinicTablet is Transmitting
OpenHIMMediator is ValidatingmTLS
@12
OpenHIMMediator is QueryingRegistry
@20
ClinicTablet is ReceiptConfirmed
OpenHIMMediator is Committed
ClinicTablet@5 <-> @20 : {SLA <= 15s end-to-end}
@enduml`,
		expectedDefiningConstructs: ['uml-timing-track', 'uml-time-axis', 'uml-waveform']
	}
};
