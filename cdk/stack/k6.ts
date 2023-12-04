import * as cdk from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as ecs from "aws-cdk-lib/aws-ecs"
import * as ecr from "aws-cdk-lib/aws-ecr"
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as imagedeploy from 'cdk-docker-image-deployment';
import * as path from "path"
import { CfnNetworkInterface } from "aws-cdk-lib/aws-ec2";

export class K6EcsStack extends cdk.Stack {
    constructor(scope, id: string, scenarioName: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'K6Vpc', {
            maxAzs: 2,
            cidr: "10.1.0.0/16",
            subnetConfiguration: [
                {
                    name: "load-testing-private-subnet",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
                    cidrMask: 24,
                },
                {
                    name: "load-testing-public-subnet",
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                }
            ]
        });

        // const repository = new ecr.Repository(this, 'K6Repository', {
        //     repositoryName: 'k6-scenario-repository',
        //     imageTagMutability: ecr.TagMutability.MUTABLE
        // });

        // new imagedeploy.DockerImageDeployment(
        //     this,
        //     "K6ScenatioImageDeployment",
        //     {
        //         source: imagedeploy.Source.directory(path.join(__dirname, "../..", "load-testing"), {
        //             buildArgs: {
        //                 SCENARIO_NAME: `${scenarioName}.js`
        //             }
        //         }),
        //         destination: imagedeploy.Destination.ecr(repository, {
        //             tag: scenarioName,
        //         }),
        //     }
        // );

        const cluster = new ecs.Cluster(this, 'K6Cluster', {
            vpc,
            enableFargateCapacityProviders: true,
        });

        // ECSタスク定義
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'K6TaskDefinition', {
            memoryLimitMiB: 512,
            cpu: 256,
            runtimePlatform: {
                operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
                cpuArchitecture: ecs.CpuArchitecture.X86_64,
            },
        });

        // コンテナをタスク定義に追加
        taskDefinition.addContainer('k6Container', {
            // image: ecs.ContainerImage.fromEcrRepository(repository, scenarioName),
            image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../..", "load-testing"), {
                buildArgs: {
                    SCENARIO_NAME: `${scenarioName}.js`
                },
            }),
            portMappings: [
                {
                    containerPort: 6565,
                    hostPort: 6565,
                    protocol: ecs.Protocol.TCP,
                },
            ],
        });

        // ECSサービス
        new ecs.FargateService(this, 'K6Service', {
            cluster,
            taskDefinition,
            platformVersion: ecs.FargatePlatformVersion.LATEST,
            desiredCount: 1, // 2つのタスクを起動
            capacityProviderStrategies: [
                {
                    capacityProvider: 'FARGATE_SPOT',
                    weight: 1,
                },
                {
                    capacityProvider: 'FARGATE',
                    weight: 0,
                },
            ],
        });
        // this.createDashboard(vpc);
    }

    createDashboard(vpc: ec2.Vpc) {

        const influxEni = new CfnNetworkInterface(this, 'InfluxNetworkInterface', {
            subnetId: vpc.privateSubnets[0].subnetId,
            privateIpAddresses: [{
                privateIpAddress: "10.1.0.254",
                primary: true
            }],
        });

        const grafanaEni = new CfnNetworkInterface(this, 'GrafanaNetworkInterface', {
            subnetId: vpc.privateSubnets[0].subnetId,
            privateIpAddresses: [{
                privateIpAddress: "10.1.0.253",
                primary: true
            }],
        });

        // Grafana用のセキュリティグループ
        const grafanaSecurityGroup = new ec2.SecurityGroup(this, 'GrafanaSecurityGroup', {
            vpc,
            allowAllOutbound: true,
        });

        const influxDbSecurityGroup = new ec2.SecurityGroup(this, 'InfluxDBSecurityGroup', {
            vpc,
            allowAllOutbound: true,
        });

        // InfluxDB用のセキュリティグループに対するルールの設定
        // Grafanaからのアクセスを許可
        influxDbSecurityGroup.addIngressRule(
            ec2.Peer.securityGroupId(grafanaSecurityGroup.securityGroupId),
            ec2.Port.tcp(8086), // InfluxDBのデフォルトポート
            'Allow Grafana to access InfluxDB'
        );

        // VPC内の他のIPアドレスからのアクセスを許可
        influxDbSecurityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(8086),
            'Allow internal VPC access to InfluxDB'
        );

        grafanaSecurityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(3000),
            'Allow internal VPC access to Grafana'
        );

        // Grafana用のEC2インスタンス
        const grafanaInstance = new ec2.Instance(this, 'GrafanaInstance', {
            vpc,
            instanceType: new ec2.InstanceType('t2.micro'),
            machineImage: new ec2.AmazonLinuxImage(),
            securityGroup: grafanaSecurityGroup,
        });

        // InfluxDB用のEC2インスタンス
        const influxDbInstance = new ec2.Instance(this, 'InfluxDbInstance', {
            vpc,
            instanceType: new ec2.InstanceType('t2.micro'),
            machineImage: new ec2.AmazonLinuxImage(),
            securityGroup: influxDbSecurityGroup,
            userData: ec2.UserData.custom(this.getInfluxUserScript()),
        });

        new ec2.CfnNetworkInterfaceAttachment(this, 'InfluxNetworkInterfaceAttachment', {
            deviceIndex: "1",
            instanceId: influxDbInstance.instanceId,
            networkInterfaceId: influxEni.ref,
        });

        new ec2.CfnNetworkInterfaceAttachment(this, 'GrafanaNetworkInterfaceAttachment', {
            deviceIndex: "1",
            instanceId: grafanaInstance.instanceId,
            networkInterfaceId: grafanaEni.ref,
        });
    }
    // ユーザーデータスクリプトを取得する関数
    private getInfluxUserScript(): string {
        // ユーザーデータスクリプトの内容
        // ここでは、GrafanaとInfluxDBをインストールするコマンドを記述する
        return `#!/bin/bash
        curl -O https://dl.influxdata.com/influxdb/releases/influxdb2-2.7.4-1.x86_64.rpm
        sudo yum localinstall influxdb2-2.7.4-1.x86_64.rpm
        sudo systemctl start influxdb
        `;
    }
}

