# Overview

The Cloudron platform can be installed on cloud servers from EC2, Digital Ocean, Hetzner,
Linode, OVH, Scaleway, Vultr etc. Currently, it is a bit tricky to get it running on a
home server or company intranet. We are actively working on that and if you would like to
alpha test it, join us at our [chat](https://chat.cloudron.io).

# Understand

Before installing the Cloudron, it is helpful to understand some of the design decisions that
behind the Cloudron.

The Cloudron intends to make self-hosting effortless. It takes care of everything - updates,
backups, firewall, dns setup, certificate management, just about everything. There is a web 
interface to manage the users and apps on the server.

This approach to self-hosting means that the Cloudron takes complete ownership of the server
and the server cannot be used for anything other than what is allowed using the web interface.
Any changes made to the server other than via the Cloudron may be lost across updates. Note that
you can package and run arbitrary apps on your Cloudron (read more in the 
[packaging guide](/tutorials/packaging.html). This way the app will persist across updates.

The Cloudron installs apps into subdomains. When installing an app, it sets up the DNS and installs
a TLS certificate (via Lets Encrypt). For this to work, the Cloudron requires a way to programmatically
configure the DNS (explained below).



For this to work, the Cloudron requires a domain that uses name servers from 
Digital Ocean or Route 53. Alternately, you can setup a wildcard DNS entry.

# Create server

Create a `Ubuntu 16.04 (Xenial)` server with at-least `1gb` RAM. Do not make any changes to vanilla ubuntu.

## Configure `my` subdomain

The Cloudron web interface is installed at the `my` subdomain of your domain. Add a `my` subdomain `A` DNS record
that points to the IP of the server created above. Doing this will allow the Cloudron to start up with a valid 
TLS certificate.

## Linode

Since Linode does not manage SSH keys, be sure to add the public key to `/root/.ssh/authorized_keys`.

## Scaleway

Use the [boot script](https://github.com/scaleway-community/scaleway-docker/issues/2) to enable memory accouting.

# Install Cloudron

SSH into your Cloud server:

```
# wget https://git.cloudron.io/cloudron/box/raw/master/scripts/cloudron-setup
# chmod +x cloudron-setup
# ./cloudron-setup --domain <domain> --provider <ec2|scaleway|generic>
```

`--domain` is the domain name in which apps are installed. Currently, only Second Level Domains are supported. For example, 
`example.com`, `example.co.uk` will work fine. Choosing a domain name at any other level like `cloudron.example.com` will
not work.

`--provider` is the name of your VPS provider. If the name is not on the list, simply choose `generic`. If the Cloudron does
not complete initialization, it may mean that we have to add some vendor specific quirks. Please let us know so we can support
your VPS provider.

The above will take around 10-20 minutes.

# First time setup

Visit `https://my.<domain>` to do first time setup of your Cloudron.

Please note the following:

1. The website should already have a valid TLS certificate. If you see any certificate warnings, it means your Cloudron was not created correctly.
2. If you see a login screen, instead of a setup screen, it means that someone else got to your Cloudron first and set it up
already! In this unlikely case, simply delete the server and start over.

Once the setup is done, you can access the admin page in the future at `https://my.<domain>`.

# DNS

If your domain uses Route 53 or Digital Ocean, provide the credentials in the `Certs & Domains`.

## Route 53

* For root credentials:
  * In AWS Console, under your name in the menu bar, click `Security Credentials`
  * Click on `Access Keys` and create a key pair.
* For IAM credentials:
    * You can use the following policy to create IAM credentials:
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "route53:*",
            "Resource": [
                "arn:aws:route53:::hostedzone/<hosted zone id>"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "route53:ListHostedZones",
                "route53:GetChange"
            ],
            "Resource": [
                "*"
            ]
        }
    ]
}
```

## Digital Ocean

Create an API token with read+write access.

## Other

If your domain *does not* use Route 53 or Digital Ocean, setup a wildcard `*` `A` DNS record that points to the
IP of the server created above. If your DNS provider has an API then let us know and we may be able to add it as
a supported DNS provider.

# Backups

The Cloudron has a backup schedule of creating one once a day. In addition to regularly scheduled backups, a backup is also created if you update the Cloudron or any of the apps (in this case only the app in question will get backed up).

Since this might result in a lot of backup data on your S3 backup bucket, we recommend adjusting the bucket properties. This can be done adding a lifecycle rule for that bucket, using the AWS console. S3 supports both permanent deletion or moving objects to the cheaper Glacier storage class based on an age attribute. With the current daily backup schedule a setting of two days should be already sufficient for most use-cases.

If your Cloudron is running, you can list backups using the following command:
```
cloudron machine backup list <domain>
```

Alternately, you can list the backups by querying S3 using the following command:
```
cloudron machine backup list --provider ec2 \
        --region <region> \
        --access-key-id <access-key-id> \
        --secret-access-key <secret-access-key> \
        --backup-bucket <s3 bucket name> \
        <domain>
```

# Restore

The Cloudron can restore itself from a backup using the following command:
```
cloudron machine create ec2 \
        --backup <backup-id> \
        --region <aws-region> \
        --type t2.small \
        --disk-size 30 \
        --ssh-key <ssh-key-name> \
        --access-key-id <aws-access-key-id> \
        --secret-access-key <aws-access-key-secret> \
        --backup-bucket <bucket-name> \
        --backup-key <secret> \
        --fqdn <domain>
```

The backup id can be obtained by [listing the backup](/references/selfhosting.html#backups). Other arguments are similar to [Cloudron creation](/references/selfhosting.html#create-the-cloudron). Once the new instance has completely restored, you can safely terminate the old Cloudron from the AWS console.

# Updates

Apps installed from the Cloudron Store are updated automatically every night.

The Cloudron platform itself updates in two ways:

* An **update** is applied onto the running server instance. Such updates are performed every night. You can use the Cloudron UI to perform updates.

* An **upgrade** requires a new OS image and thus has to be performed using the CLI tool. This process involves creating a new EC2 instance is created using the latest image and all the data and apps are restored. The `cloudron machine update` command can be used when an _upgrade_ is available (you will get a notification in the UI).
```
    cloudron machine update <domain>
```
Once the upgrade is complete, you can safely terminate the old EC2 instance.

The Cloudron will always make a complete backup before attempting an update or upgrade. In the unlikely case an update fails, it can be [restored](/references/selfhosting.html#restore).

# SSH

If you want to SSH into your Cloudron, you can
```
ssh -p 202 -i ~/.ssh/ssh_key_name root@my.<domain>
```

If you are unable to connect, verify the following:
* Be sure to use the **my.** subdomain (eg. my.foobar.com).
* The SSH Key should be in PEM format. If you are using Putty PPK files, follow [this article](http://stackoverflow.com/questions/2224066/how-to-convert-ssh-keypairs-generated-using-puttygenwindows-into-key-pairs-use) to convert it to PEM format.
* The SSH Key must have correct permissions (400) set (this is a requirement of the ssh client).

# Mail

Your server's IP plays a big role in how emails from our Cloudron get handled. Spammers frequently abuse public IP addresses
and as a result your Cloudron might possibly start out with a bad reputation. The good news is that most IP based
blacklisting services cool down over time. The Cloudron sets up DNS entries for SPF, DKIM, DMARC automatically and
reputation should be easy to get back.

## Checklist

* Once your Cloudron is ready, setup a Reverse DNS PTR record to be setup for the `my` subdomain.

    * For AWS/EC2, you can find the request form [here](https://aws-portal.amazon.com/gp/aws/html-forms-controller/contactus/ec2-email-limit-rdns-request.

    * For Digital Ocean this is automatic. Digital Ocean sets up a PTR record based on the droplet's name. For this reason, it is important that you do not rename your server and keep it at `my.<domain>`.

    * For Scaleway, edit your security group to allow email. You can also set a PTR record on the interface with your
    `my.<domain>`.

* Check if your IP is listed in any DNSBL list [here](http://multirbl.valli.org/). In most cases, you can apply for removal
of your IP by filling out a form at the DNSBL manager site.

* Finally, check your spam score at [mail-tester.com](https://www.mail-tester.com/). The Cloudron should get 100%, if not please let
us know.

# Debugging

To debug the Cloudron CLI tool:

* `DEBUG=* cloudron <cmd>`

You can also [SSH](#ssh) into your Cloudron and collect logs.

* `journalctl -a -u box -u cloudron-installer` to get debug output of box related code.
* `docker ps` will give you the list of containers. The addon containers are named as `mail`, `postgresql`, `mysql` etc. If you want to get a specific
   containers log output, `journalctl -a CONTAINER_ID=<container_id>`.

# Hotfixing

Hotfixing is the process of patching your Cloudron to run the latest git code. This is useful if require a patch urgently and for testing and development. Note that it is ot possible to hotfix between arbitrary git revisions (for example, if there is some
db migration involved), so use this with care.

To hotfix your cloudron, run the following from the `box` code checkout:

```
    cloudron machine hotfix --ssh-key <key> <domain>
```

# Other Providers

Currently, we do not support other cloud server provider. Please let us know at [support@cloudron.io](mailto:support@cloudron.io), if you want to see other providers supported.

# Help

If you run into any problems, join us in our [chat](https://chat.cloudron.io) or [email us](mailto:support@cloudron.io).































# CLI Tool

The [Cloudron tool](https://git.cloudron.io/cloudron/cloudron-cli) is useful for managing a Cloudron.

<br/>
<b class="text-danger">The Cloudron CLI tool has to be run on a Laptop or PC, not on the cloud server!</b>
<br/>

## Linux & OS X
Installing the CLI tool requires node.js and npm. The CLI tool can be installed using the following command:

```
npm install -g cloudron
```

Depending on your setup, you may need to run this as root.

On OS X, it is known to work with the `openssl` package from homebrew.

See [#14](https://git.cloudron.io/cloudron/cloudron-cli/issues/14) for more information.

## Windows

The CLI tool does not work on Windows.

## Machine subcommands

You should now be able to run the `cloudron machine help` command in a shell.

```
create      Creates a new Cloudron
restore     Restores a Cloudron
migrate     Migrates a Cloudron
update      Upgrade or updates a Cloudron
eventlog    Get Cloudron eventlog
logs        Get Cloudron logs
ssh         Get remote SSH connection
backup      Manage Cloudron backups
```

# AWS EC2

## Requirements

To run the Cloudron on AWS, first sign up with [Amazon AWS](https://aws.amazon.com/).

The Cloudron uses the following AWS services:

* **EC2** for creating a virtual private server that runs the Cloudron code.
* **Route53** for DNS. The Cloudron will manage all app subdomains as well as the email related DNS records automatically.
* **S3** to store encrypted Cloudron backups.

The minimum requirements for a Cloudron depends on the apps installed. The absolute minimum required EC2 instance is `t2.small`.

The Cloudron runs best on instances which do not have a burst mode VCPU.

The system disk space usage of a Cloudron is around 15GB. This results in a minimum requirement of about 30GB to give some headroom for app installations and user data.

## Cost Estimation

Taking the minimal requirements of hosting on EC2, with a backup retention of 2 days, the cost estimation per month is as follows:

```
Route53:       0.90
EC2:          19.04
EBS:           3.00
S3:            1.81
-------------------------
Total:      $ 24.75/mth
```

For custom cost estimation, please use the [AWS Cost Calculator](http://calculator.s3.amazonaws.com/index.html)

## Setup

Open the AWS console and create the required resources:

1. Create a Route53 zone for your domain. Be sure to set the Route53 nameservers for your domain in your name registrar. Note: Only Second Level Domains are supported.
   For example, `example.com`, `example.co.uk` will work fine. Choosing a domain name at any other level like `cloudron.example.com` will not work.

2. Create a S3 bucket for backups. The bucket region **must* be the same region as where you intend to create your Cloudron (EC2).

When creating the S3 bucket, it is important to choose a region. Do **NOT** choose `US Standard`.

The supported regions are:
    * US East (N. Virginia)       us-east-1
    * US West (N. California)     us-west-1
    * US West (Oregon)            us-west-2
    * Asia Pacific (Mumbai)       ap-south-1
    * Asia Pacific (Seoul)        ap-northeast-2
    * Asia Pacific (Sydney)       ap-southeast-2
    * Asia Pacific (Tokyo)        ap-northeast-1
    * EU (Frankfurt)              eu-central-1
    * EU (Ireland)                eu-west-1
    * South America (São Paulo)   sa-east-1

3. Create a new SSH key or upload an existing SSH key in the target region (`Key Pairs` in the left pane of the EC2 console).

4. Create AWS credentials. You can either use root **or** IAM credentials.
  * For root credentials:
    * In AWS Console, under your name in the menu bar, click `Security Credentials`
    * Click on `Access Keys` and create a key pair.
  * For IAM credentials:
    * You can use the following policy to create IAM credentials:
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "route53:*",
            "Resource": [
                "arn:aws:route53:::hostedzone/<hosted zone id>"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "route53:ListHostedZones",
                "route53:GetChange"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": [
                "arn:aws:s3:::<your bucket name>",
                "arn:aws:s3:::<your bucket name>/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "ec2:*",
            "Resource": [
                "*"
            ],
            "Condition": {
                "StringEquals": {
                    "ec2:Region": "<ec2 region>"
                }
            }
        }
    ]
}
```

## Create the Cloudron

Create the Cloudron using the `cloudron machine` command:

```
cloudron machine create ec2 \
        --region <aws-region> \
        --type t2.small \
        --disk-size 30 \
        --ssh-key <ssh-key-name-or-filepath> \
        --access-key-id <aws-access-key-id> \
        --secret-access-key <aws-access-key-secret> \
        --backup-bucket <bucket-name> \
        --backup-key '<secret>' \
        --fqdn <domain>
```

The `--region` is the region where your Cloudron is to be created. For example, `us-west-1` for N. California and `eu-central-1` for Frankfurt. A complete list of available
regions is listed <a href="//docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html#concepts-available-regions" target="_blank">here</a>.

The `--disk-size` parameter indicates the volume (hard disk) size to be allocated for the Cloudron.

The `--ssh-key` is the path to a PEM file or the private SSH Key. If your key is located as `~/.ssh/id_rsa_<name>`, you can
also simply provide the `name` as the argument.

The `--backup-key '<secret>'` will be used to encrypt all backups prior to uploading to S3. Keep that secret in a safe place, as you need it to restore your Cloudron from a backup! You can generate a random key using `pwgen -1y 64`. Be sure to put single quotes
around the `secret` to prevent accidental shell expansion.

**NOTE**: The `cloudron machine create ec2` subcommand will automatically create a corresponding VPC, subnet and security group for your Cloudron, unless `--subnet` and `--security-group` arguments are explicitly passed in. If you want to reuse existing resources, please ensure that the security group does not limit any traffic to the Cloudron since the Cloudron manages its own firewall and that the subnet has an internet gateway setup in the routing table.

**NOTE**: See `cloudron machine create ec2 --help` for all available options.

# DigitalOcean

<a id="requirements-1"></a>
## Requirements

To run the Cloudron on DigitalOcean, first sign up with [DigitalOcean](https://m.do.co/c/933831d60a1e) (Use this referral link to get $10 credit).

The minimum requirements for a Cloudron depends on the apps installed. The absolute minimum Droplet required is `1gb`.

All backups on DigitalOcean Cloudrons are stored locally at `/var/backups`. We recommend to download backups from time to time to a different location using `cloudron machine backup download`.

<a id="setup-1"></a>
## Setup

Open the DigitalOcean console and do the following:

1. Create an API token with read+write access.

2. Upload the SSH key which you intend to use for your Cloudron.

3. Add the domain you intend to use for your Cloudron.

  * Due to how the DigitalOcean interface works, you have to provide a dummy IPv4 (like `1.2.3.4`) to add a domain.

  * Click on the domain you created and delete the '@' dummy record created above.

<a id="create-the-cloudron-1"></a>
## Create the Cloudron

Create the Cloudron using the `cloudron machine` command:

Note: Only Second Level Domains are supported. For example, `example.com`, `example.co.uk` will work fine. Choosing a domain name at any other level like `cloudron.example.com` will not work.

```
cloudron machine create digitalocean \
        --fqdn <domain> \
        --region <digitalocean-region> \
        --token <digitalocean-api-token> \
        --ssh-key <ssh-key-name-or-filepath> \
        --backup-key <backup-key>
```

The `--region` is the region where your Cloudron is to be created. For example, `nyc3` for New York and `fra1` for Frankfurt. A complete list of available
regions can be obtained <a href="https://developers.digitalocean.com/documentation/v2/#regions" target="_blank">here</a>.

The `--ssh-key` is the path to a PEM file or the private SSH Key. If your key is located as `~/.ssh/id_rsa_<name>`, you can
also simply provide `name` as the argument.

The `--backup-key '<secret>'` will be used to encrypt all backups. Keep that secret in a safe place, as you need it to restore your Cloudron from a backup! You can generate a random key using `pwgen -1y 64`. Be sure to put single quotes
around the `secret` to prevent accidental shell expansion.

**NOTE**: See `cloudron machine create digitalocean --help` for all available options.

# Generic

<a id="requirements-2"></a>
## Requirements

The Cloudron does not support servers other than EC2 and Digital Ocean. However, it is possible to install & run
the Cloudron easily on any cloud server (Vultr, Linode, Hetzner, OVH, etc) with SSH access.

The following requirements must be met:
* Create a server with Ubuntu 16.04. Do not make any changes to vanilla ubuntu.
* The minimum requirements for a Cloudron depends on the apps installed. The absolute minimum Droplet required is `1gb`.

**NOTE**: Cloudron created on a generic machine cannot be easily updated or restored.

<a id="setup-2"></a>
## Setup

* Setup a wildcard DNS entry (`*.domain.com`) for your domain to point to the IP of the server you have created.

### Linode

Since Linode does not manage SSH keys, be sure to add the public key to `/root/.ssh/authorized_keys`.

### Scaleway

* Use the [boot script](https://github.com/scaleway-community/scaleway-docker/issues/2) to enable memory accouting.

<a id="create-the-cloudron-2"></a>
## Create the Cloudron

Create the Cloudron using the `cloudron machine` command:

Note: Only Second Level Domains are supported. For example, `example.com`, `example.co.uk` will work fine. Choosing a domain name at any other level like `cloudron.example.com` will not work.

```
cloudron machine create generic \
        --ip <ip> \
        --fqdn <domain> \
        --ssh-key <ssh-key-name-or-filepath> \
        --backup-key <backup-key>
```

The `--ip` is the public IP of your server.

The `--ssh-key` is the path to a PEM file or the private SSH Key. If your key is located as `~/.ssh/id_rsa_<name>`, you can
also simply provide `name` as the argument.

The `--backup-key '<secret>'` will be used to encrypt all backups. Keep that secret in a safe place, as you need it to restore your Cloudron from a backup! You can generate a random key using `pwgen -1y 64`. Be sure to put single quotes
around the `secret` to prevent accidental shell expansion.

